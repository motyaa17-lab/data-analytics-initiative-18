import json
import os
import re
# v2
import secrets
import psycopg2

CORS_H = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
    'Access-Control-Max-Age': '86400',
}
CH = {'Access-Control-Allow-Origin': '*'}
VALID_CHANNELS = {'general', 'meet', 'memes', 'teammates'}

def sanitize(v: str) -> str:
    v = re.sub(r'<[^>]*>', '', v)
    v = re.sub(r'javascript:', '', v, flags=re.IGNORECASE)
    v = re.sub(r'[;&]', '', v)
    return v.strip()

def log(cur, schema, source, msg, level='info', details=None, ip=None, user_id=None):
    m = msg.replace("'", "''")
    d = (details or '').replace("'", "''")
    uid = user_id or 'NULL'
    cur.execute(f"INSERT INTO {schema}.error_logs(level,source,message,details,ip,user_id) VALUES('{level}','{source}','{m}','{d}','{ip or ''}',{uid})")

def rate_limit(cur, schema, key, limit, window_sec):
    cur.execute(f"SELECT count, window_start FROM {schema}.rate_limits WHERE key='{key}'")
    row = cur.fetchone()
    if row:
        count, ws = row
        cur.execute(f"SELECT EXTRACT(EPOCH FROM (now()-'{ws}'::timestamp))")
        elapsed = cur.fetchone()[0]
        if elapsed > window_sec:
            cur.execute(f"UPDATE {schema}.rate_limits SET count=1,window_start=now() WHERE key='{key}'")
            return False
        if count >= limit:
            return True
        cur.execute(f"UPDATE {schema}.rate_limits SET count=count+1 WHERE key='{key}'")
    else:
        cur.execute(f"INSERT INTO {schema}.rate_limits(key,count,window_start) VALUES('{key}',1,now()) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1")
    return False

def get_user(cur, schema, token, require_admin=False):
    if not token:
        return None
    safe = token.replace("'", "''")
    af = "AND u.is_admin=TRUE" if require_admin else ""
    cur.execute(f"SELECT u.id,u.username,u.favorite_game,u.is_banned,u.is_admin FROM {schema}.sessions s JOIN {schema}.users u ON u.id=s.user_id WHERE s.token='{safe}' AND u.is_banned=FALSE {af}")
    return cur.fetchone()

def handler(event: dict, context) -> dict:
    """Единый API: сообщения, комнаты, инвайты, админ. Роутинг через ?action="""

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_H, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', 'messages')
    ip = (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', 'unknown')
    token = (event.get('headers') or {}).get('X-Authorization', '').replace('Bearer ', '').strip()
    schema = os.environ['MAIN_DB_SCHEMA']
    body = json.loads(event.get('body') or '{}')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    def resp(code, data):
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': code, 'headers': CH, 'body': json.dumps(data, default=str)}

    def err(code, msg):
        return resp(code, {'error': msg})

    # ─── MESSAGES ────────────────────────────────────────────

    if action == 'messages':
        if method == 'GET':
            channel = params.get('channel', 'general')
            room_id_str = params.get('room_id', '')
            if room_id_str and str(room_id_str).isdigit():
                room_id = int(room_id_str)
                # Комната — только для участников
                user = get_user(cur, schema, token)
                if not user: return err(401, 'Необходима авторизация')
                uid = user[0]
                cur.execute(f"SELECT 1 FROM {schema}.room_members WHERE room_id={room_id} AND user_id={uid}")
                if not cur.fetchone(): return err(403, 'Ты не участник этой комнаты')
                # Обновляем last_seen
                cur.execute(f"UPDATE {schema}.users SET last_seen=now() WHERE id={uid}")
                cur.execute(
                    f"SELECT m.id,m.content,m.created_at,u.username,u.favorite_game "
                    f"FROM {schema}.messages m JOIN {schema}.users u ON u.id=m.user_id "
                    f"WHERE m.room_id={room_id} ORDER BY m.created_at ASC LIMIT 100"
                )
            else:
                if channel not in VALID_CHANNELS: channel = 'general'
                # Обновляем last_seen если авторизован
                user = get_user(cur, schema, token)
                if user:
                    cur.execute(f"UPDATE {schema}.users SET last_seen=now() WHERE id={user[0]}")
                cur.execute(
                    f"SELECT m.id,m.content,m.created_at,u.username,u.favorite_game "
                    f"FROM {schema}.messages m JOIN {schema}.users u ON u.id=m.user_id "
                    f"WHERE m.channel='{channel}' AND m.room_id IS NULL ORDER BY m.created_at ASC LIMIT 100"
                )
            rows = cur.fetchall()
            return resp(200, {'messages': [{'id':r[0],'content':r[1],'created_at':str(r[2]),'username':r[3],'favorite_game':r[4] or ''} for r in rows]})

        if method == 'POST':
            user = get_user(cur, schema, token)
            if not user: return err(401, 'Необходима авторизация')
            uid, uname, fav_game, is_banned, is_admin = user

            if rate_limit(cur, schema, f'msg:{uid}', 5, 10):
                log(cur, schema, 'messages', 'Spam', level='warn', ip=ip, user_id=uid)
                return err(429, 'Слишком быстро. Подожди немного.')

            content = sanitize(body.get('content') or '')
            channel = body.get('channel', 'general')
            room_id_str = str(body.get('room_id', ''))

            if not content: return err(400, 'Сообщение пустое')
            if len(content) > 2000: return err(400, 'Максимум 2000 символов')

            sc = content.replace("'", "''")
            if room_id_str.isdigit():
                room_id = int(room_id_str)
                cur.execute(f"SELECT 1 FROM {schema}.room_members WHERE room_id={room_id} AND user_id={uid}")
                if not cur.fetchone(): return err(403, 'Ты не участник этой комнаты')
                cur.execute(f"INSERT INTO {schema}.messages(user_id,room_id,content) VALUES({uid},{room_id},'{sc}') RETURNING id,created_at")
            else:
                if channel not in VALID_CHANNELS: channel = 'general'
                cur.execute(f"INSERT INTO {schema}.messages(user_id,channel,content) VALUES({uid},'{channel}','{sc}') RETURNING id,created_at")

            msg_id, created_at = cur.fetchone()
            return resp(200, {'success':True,'message':{'id':msg_id,'content':content,'created_at':str(created_at),'username':uname,'favorite_game':fav_game or ''}})

    # ─── ROOMS ───────────────────────────────────────────────

    if action == 'rooms' and method == 'GET':
        cur.execute(
            f"SELECT r.id,r.name,r.description,r.created_at,u.username,"
            f"(SELECT COUNT(*) FROM {schema}.room_members rm WHERE rm.room_id=r.id) "
            f"FROM {schema}.rooms r JOIN {schema}.users u ON u.id=r.owner_id "
            f"WHERE r.is_public=TRUE ORDER BY r.created_at DESC LIMIT 50"
        )
        rows = cur.fetchall()
        return resp(200, {'rooms': [{'id':r[0],'name':r[1],'description':r[2],'created_at':str(r[3]),'owner':r[4],'members':r[5]} for r in rows]})

    if action == 'rooms' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid, uname, _, _, is_admin = user

        if rate_limit(cur, schema, f'rooms:{uid}', 3, 3600): return err(429, 'Лимит: 3 комнаты в час')

        name = sanitize(body.get('name') or '')
        description = sanitize(body.get('description') or '')
        is_public = bool(body.get('is_public', True))

        if len(name) < 2 or len(name) > 32: return err(400, 'Название: 2–32 символа')

        sn = name.replace("'","''"); sd = description.replace("'","''")
        pub = 'TRUE' if is_public else 'FALSE'
        cur.execute(f"INSERT INTO {schema}.rooms(name,description,owner_id,is_public) VALUES('{sn}','{sd}',{uid},{pub}) RETURNING id,created_at")
        room_id, created_at = cur.fetchone()
        cur.execute(f"INSERT INTO {schema}.room_members(room_id,user_id) VALUES({room_id},{uid})")
        code = secrets.token_urlsafe(8)
        cur.execute(f"INSERT INTO {schema}.invites(code,room_id,created_by) VALUES('{code}',{room_id},{uid})")
        return resp(201, {'room':{'id':room_id,'name':name,'description':description,'is_public':is_public,'created_at':str(created_at),'invite_code':code}})

    if action == 'join' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid, uname, _, _, _ = user

        code = params.get('code', '').replace("'","''")
        if not code: return err(400, 'Укажи код инвайта')

        cur.execute(f"SELECT i.room_id,i.uses,i.max_uses,i.expires_at,r.name FROM {schema}.invites i JOIN {schema}.rooms r ON r.id=i.room_id WHERE i.code='{code}'")
        inv = cur.fetchone()
        if not inv: return err(404, 'Инвайт не найден')

        room_id, uses, max_uses, expires_at, room_name = inv
        if max_uses and uses >= max_uses: return err(410, 'Инвайт исчерпан')
        if expires_at:
            cur.execute(f"SELECT now() > '{expires_at}'::timestamp")
            if cur.fetchone()[0]: return err(410, 'Инвайт истёк')

        cur.execute(f"SELECT 1 FROM {schema}.room_members WHERE room_id={room_id} AND user_id={uid}")
        already = bool(cur.fetchone())
        if not already:
            cur.execute(f"INSERT INTO {schema}.room_members(room_id,user_id) VALUES({room_id},{uid})")
            cur.execute(f"UPDATE {schema}.invites SET uses=uses+1 WHERE code='{code}'")
        return resp(200, {'ok':True,'room_id':room_id,'room_name':room_name,'already_member':already})

    if action == 'invite' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid, uname, _, _, is_admin = user

        rid = params.get('room_id', '')
        if not str(rid).isdigit(): return err(400, 'Укажи room_id')
        rid = int(rid)
        cur.execute(f"SELECT owner_id FROM {schema}.rooms WHERE id={rid}")
        room = cur.fetchone()
        if not room: return err(404, 'Комната не найдена')
        if room[0] != uid and not is_admin: return err(403, 'Только владелец')

        code = secrets.token_urlsafe(8)
        cur.execute(f"INSERT INTO {schema}.invites(code,room_id,created_by) VALUES('{code}',{rid},{uid})")
        return resp(201, {'invite_code': code})

    # ─── ADMIN ───────────────────────────────────────────────

    if action == 'admin_stats' and method == 'GET':
        user = get_user(cur, schema, token, require_admin=True)
        if not user: return err(403, 'Доступ запрещён')
        cur.execute(f"SELECT COUNT(*) FROM {schema}.users"); tu = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.users WHERE is_banned=TRUE"); bu = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.messages"); tm = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.rooms"); tr = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.error_logs WHERE created_at > now()-interval '24 hours'"); e24 = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.users WHERE created_at > now()-interval '24 hours'"); nu = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.messages WHERE created_at > now()-interval '24 hours'"); m24 = cur.fetchone()[0]
        return resp(200, {'stats':{'total_users':tu,'banned_users':bu,'total_messages':tm,'total_rooms':tr,'errors_24h':e24,'new_users_24h':nu,'messages_24h':m24}})

    if action == 'admin_logs' and method == 'GET':
        user = get_user(cur, schema, token, require_admin=True)
        if not user: return err(403, 'Доступ запрещён')
        limit = min(int(params.get('limit', 50)), 200)
        level = params.get('level', '').replace("'","''")
        lf = f"AND level='{level}'" if level else ''
        cur.execute(f"SELECT id,level,source,message,details,ip,user_id,created_at FROM {schema}.error_logs WHERE 1=1 {lf} ORDER BY created_at DESC LIMIT {limit}")
        rows = cur.fetchall()
        return resp(200, {'logs':[{'id':r[0],'level':r[1],'source':r[2],'message':r[3],'details':r[4],'ip':r[5],'user_id':r[6],'created_at':str(r[7])} for r in rows]})

    if action == 'admin_users' and method == 'GET':
        user = get_user(cur, schema, token, require_admin=True)
        if not user: return err(403, 'Доступ запрещён')
        limit = min(int(params.get('limit', 50)), 200)
        offset = int(params.get('offset', 0))
        q = params.get('q', '').replace("'","''")
        sf = f"AND (username ILIKE '%{q}%' OR email ILIKE '%{q}%')" if q else ''
        cur.execute(f"SELECT id,username,email,favorite_game,is_admin,is_banned,created_at FROM {schema}.users WHERE 1=1 {sf} ORDER BY created_at DESC LIMIT {limit} OFFSET {offset}")
        rows = cur.fetchall()
        return resp(200, {'users':[{'id':r[0],'username':r[1],'email':r[2],'favorite_game':r[3],'is_admin':r[4],'is_banned':r[5],'created_at':str(r[6])} for r in rows]})

    if action == 'admin_ban' and method == 'POST':
        user = get_user(cur, schema, token, require_admin=True)
        if not user: return err(403, 'Доступ запрещён')
        uid_admin = user[0]
        target_id = body.get('user_id')
        ban = bool(body.get('ban', True))
        if not target_id: return err(400, 'Укажи user_id')

        cur.execute(f"SELECT id,is_admin FROM {schema}.users WHERE id={int(target_id)}")
        target = cur.fetchone()
        if not target: return err(404, 'Пользователь не найден')
        if target[1]: return err(403, 'Нельзя банить администратора')

        action_val = 'TRUE' if ban else 'FALSE'
        cur.execute(f"UPDATE {schema}.users SET is_banned={action_val} WHERE id={int(target_id)}")
        if ban:
            cur.execute(f"DELETE FROM {schema}.sessions WHERE user_id={int(target_id)}")
        log(cur, schema, 'admin', f"{'Ban' if ban else 'Unban'} user {target_id}", user_id=uid_admin)
        return resp(200, {'ok':True,'banned':ban})

    # ─── ONLINE ──────────────────────────────────────────────

    if action == 'online' and method == 'GET':
        # Онлайн = last_seen за последние 2 минуты
        channel = params.get('channel', '')
        room_id_str = params.get('room_id', '')
        cur.execute(
            f"SELECT COUNT(*) FROM {schema}.users "
            f"WHERE last_seen > now() - interval '2 minutes' AND is_banned=FALSE"
        )
        total_online = cur.fetchone()[0]
        return resp(200, {'online': total_online})

    return err(404, 'Not found')
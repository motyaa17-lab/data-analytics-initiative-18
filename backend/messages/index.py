import base64
import json
import os
import re
import time
import random
# v4
import secrets
import boto3
import psycopg2

CORS_H = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
    'Access-Control-Max-Age': '86400',
}
CH = {'Access-Control-Allow-Origin': '*'}
VALID_CHANNELS = {'general', 'meet', 'memes', 'teammates'}
VALID_EMOJI = {'👍', '❤️', '😂', '😮', '😢', '🔥', '👎', '🎮'}

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

def s3_client():
    return boto3.client('s3', endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'])

def get_reactions(cur, schema, message_ids):
    if not message_ids:
        return {}
    ids_str = ','.join(str(i) for i in message_ids)
    cur.execute(
        f"SELECT message_id, emoji, COUNT(*) as cnt, "
        f"array_agg(user_id) as user_ids "
        f"FROM {schema}.message_reactions "
        f"WHERE message_id IN ({ids_str}) AND is_active=TRUE "
        f"GROUP BY message_id, emoji"
    )
    result = {}
    for row in cur.fetchall():
        mid, emoji, cnt, uids = row
        if mid not in result:
            result[mid] = []
        result[mid].append({'emoji': emoji, 'count': cnt, 'users': uids or []})
    return result

def cleanup(cur, schema):
    cur.execute(f"DELETE FROM {schema}.error_logs WHERE created_at < now() - interval '7 days'")
    cur.execute(f"DELETE FROM {schema}.rate_limits WHERE window_start < now() - interval '1 day'")
    cur.execute(f"DELETE FROM {schema}.sessions WHERE created_at < now() - interval '30 days'")
    cur.execute(f"DELETE FROM {schema}.messages WHERE is_removed=TRUE AND created_at < now() - interval '90 days'")

def handler(event: dict, context) -> dict:
    """Единый API: сообщения, реакции, удаление, комнаты, инвайты, друзья, DM, настройки. ?action="""

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

    if random.random() < 0.02:
        cleanup(cur, os.environ['MAIN_DB_SCHEMA'])

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
                user = get_user(cur, schema, token)
                if not user: return err(401, 'Необходима авторизация')
                uid = user[0]
                cur.execute(f"SELECT 1 FROM {schema}.room_members WHERE room_id={room_id} AND user_id={uid}")
                if not cur.fetchone(): return err(403, 'Ты не участник этой комнаты')
                cur.execute(f"UPDATE {schema}.users SET last_seen=now() WHERE id={uid}")
                cur.execute(
                    f"SELECT m.id,m.content,m.created_at,u.username,u.favorite_game,m.is_removed,m.user_id,m.edited,u.avatar_url,u.badge,m.image_url,m.voice_url "
                    f"FROM {schema}.messages m JOIN {schema}.users u ON u.id=m.user_id "
                    f"WHERE m.room_id={room_id} ORDER BY m.created_at ASC LIMIT 100"
                )
            else:
                if channel not in VALID_CHANNELS: channel = 'general'
                user = get_user(cur, schema, token)
                if user:
                    cur.execute(f"UPDATE {schema}.users SET last_seen=now() WHERE id={user[0]}")
                cur.execute(
                    f"SELECT m.id,m.content,m.created_at,u.username,u.favorite_game,m.is_removed,m.user_id,m.edited,u.avatar_url,u.badge,m.image_url,m.voice_url "
                    f"FROM {schema}.messages m JOIN {schema}.users u ON u.id=m.user_id "
                    f"WHERE m.channel='{channel}' AND m.room_id IS NULL ORDER BY m.created_at ASC LIMIT 100"
                )
            rows = cur.fetchall()
            message_ids = [r[0] for r in rows]
            reactions = get_reactions(cur, schema, message_ids)
            msgs = []
            for r in rows:
                mid, content, created_at, username, fav, is_removed, msg_uid, edited, avatar_url, badge, image_url, voice_url = r
                msgs.append({
                    'id': mid,
                    'content': content if not is_removed else '',
                    'created_at': str(created_at),
                    'username': username,
                    'favorite_game': fav or '',
                    'is_removed': bool(is_removed),
                    'author_id': msg_uid,
                    'edited': bool(edited),
                    'avatar_url': avatar_url or '',
                    'badge': badge or '',
                    'image_url': image_url or '',
                    'voice_url': voice_url or '',
                    'reactions': reactions.get(mid, [])
                })
            return resp(200, {'messages': msgs})

        if method == 'POST':
            user = get_user(cur, schema, token)
            if not user: return err(401, 'Необходима авторизация')
            uid, uname, fav_game, is_banned, is_admin = user

            if rate_limit(cur, schema, f'msg:{uid}', 5, 10):
                log(cur, schema, 'messages', 'Spam', level='warn', ip=ip, user_id=uid)
                return err(429, 'Слишком быстро. Подожди немного.')

            content = sanitize(body.get('content') or '')
            image_url = body.get('image_url') or ''
            voice_url = body.get('voice_url') or ''
            channel = body.get('channel', 'general')
            room_id_str = str(body.get('room_id', ''))

            if not content and not image_url and not voice_url: return err(400, 'Сообщение пустое')
            if len(content) > 2000: return err(400, 'Максимум 2000 символов')

            sc = content.replace("'", "''")
            img_val = f"'{image_url.replace(chr(39), '')}'" if image_url else 'NULL'
            voice_val = f"'{voice_url.replace(chr(39), '')}'" if voice_url else 'NULL'
            if room_id_str.isdigit():
                room_id = int(room_id_str)
                cur.execute(f"SELECT 1 FROM {schema}.room_members WHERE room_id={room_id} AND user_id={uid}")
                if not cur.fetchone(): return err(403, 'Ты не участник этой комнаты')
                cur.execute(f"INSERT INTO {schema}.messages(user_id,room_id,content,image_url,voice_url) VALUES({uid},{room_id},'{sc}',{img_val},{voice_val}) RETURNING id,created_at")
            else:
                if channel not in VALID_CHANNELS: channel = 'general'
                cur.execute(f"INSERT INTO {schema}.messages(user_id,channel,content,image_url,voice_url) VALUES({uid},'{channel}','{sc}',{img_val},{voice_val}) RETURNING id,created_at")

            msg_id, created_at = cur.fetchone()
            cur.execute(f"SELECT avatar_url, badge FROM {schema}.users WHERE id={uid}")
            av_row = cur.fetchone()
            return resp(200, {'success': True, 'message': {
                'id': msg_id, 'content': content, 'created_at': str(created_at),
                'username': uname, 'favorite_game': fav_game or '',
                'is_removed': False, 'author_id': uid, 'edited': False,
                'avatar_url': av_row[0] if av_row and av_row[0] else '',
                'badge': av_row[1] if av_row and av_row[1] else '',
                'image_url': image_url,
                'voice_url': voice_url,
                'reactions': []
            }})

    # ─── UPLOAD VOICE ────────────────────────────────────────

    if action == 'upload_voice':
        """Загружает голосовое сообщение (base64 webm/ogg) в S3 и возвращает CDN URL"""
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid = user[0]
        audio_b64 = body.get('audio')
        if not audio_b64: return err(400, 'Нет аудио данных')
        try:
            audio_data = base64.b64decode(audio_b64)
        except Exception:
            return err(400, 'Неверный формат base64')
        if len(audio_data) > 5 * 1024 * 1024:
            return err(400, 'Файл слишком большой (макс 5MB)')
        ext = body.get('ext', 'webm')
        fname = f"voice/{uid}_{int(time.time())}_{secrets.token_hex(4)}.{ext}"
        s3 = s3_client()
        s3.put_object(Bucket='files', Key=fname, Body=audio_data, ContentType=f'audio/{ext}')
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{fname}"
        return resp(200, {'url': cdn_url})

    # ─── DELETE MESSAGE ───────────────────────────────────────

    if action == 'delete_msg' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid, uname, _, _, is_admin = user
        msg_id = int(body.get('msg_id', 0))
        if not msg_id: return err(400, 'Укажи msg_id')
        cur.execute(f"SELECT user_id FROM {schema}.messages WHERE id={msg_id}")
        row = cur.fetchone()
        if not row: return err(404, 'Сообщение не найдено')
        if row[0] != uid and not is_admin: return err(403, 'Нет прав')
        cur.execute(f"UPDATE {schema}.messages SET is_removed=TRUE WHERE id={msg_id}")
        return resp(200, {'ok': True})

    # ─── REACTIONS ────────────────────────────────────────────

    if action == 'react' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid = user[0]
        msg_id = int(body.get('msg_id', 0))
        emoji = body.get('emoji', '')
        if emoji not in VALID_EMOJI: return err(400, 'Недопустимый эмодзи')
        if not msg_id: return err(400, 'Укажи msg_id')
        cur.execute(f"SELECT id, is_active FROM {schema}.message_reactions WHERE message_id={msg_id} AND user_id={uid} AND emoji='{emoji}'")
        existing = cur.fetchone()
        if existing:
            new_active = not existing[1]
            cur.execute(f"UPDATE {schema}.message_reactions SET is_active={'TRUE' if new_active else 'FALSE'} WHERE id={existing[0]}")
        else:
            cur.execute(f"INSERT INTO {schema}.message_reactions(message_id,user_id,emoji,is_active) VALUES({msg_id},{uid},'{emoji}',TRUE)")
            new_active = True
        cur.execute(f"SELECT COUNT(*) FROM {schema}.message_reactions WHERE message_id={msg_id} AND emoji='{emoji}' AND is_active=TRUE")
        cnt = cur.fetchone()[0]
        cur.execute(f"SELECT array_agg(user_id) FROM {schema}.message_reactions WHERE message_id={msg_id} AND emoji='{emoji}' AND is_active=TRUE")
        uids = cur.fetchone()[0] or []
        return resp(200, {'ok': True, 'added': new_active, 'count': cnt, 'users': uids})

    # ─── ROOMS ───────────────────────────────────────────────

    if action == 'rooms' and method == 'GET':
        user = get_user(cur, schema, token)
        if not user:
            cur.execute(
                f"SELECT r.id,r.name,r.description,r.created_at,u.username,"
                f"(SELECT COUNT(*) FROM {schema}.room_members rm WHERE rm.room_id=r.id) "
                f"FROM {schema}.rooms r JOIN {schema}.users u ON u.id=r.owner_id "
                f"WHERE r.is_public=TRUE ORDER BY r.created_at DESC LIMIT 50"
            )
            rows = cur.fetchall()
            return resp(200, {'rooms': [{'id':r[0],'name':r[1],'description':r[2],'created_at':str(r[3]),'owner':r[4],'members':r[5]} for r in rows]})
        uid = user[0]
        cur.execute(
            f"SELECT r.id,r.name,r.description,r.created_at,u.username,"
            f"(SELECT COUNT(*) FROM {schema}.room_members rm WHERE rm.room_id=r.id) "
            f"FROM {schema}.rooms r JOIN {schema}.users u ON u.id=r.owner_id "
            f"JOIN {schema}.room_members me ON me.room_id=r.id AND me.user_id={uid} "
            f"ORDER BY r.created_at DESC LIMIT 50"
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

    # ─── INVITE FRIEND TO ROOM ────────────────────────────────

    if action == 'invite_friend' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid, uname, _, _, is_admin = user

        room_id = int(body.get('room_id', 0))
        friend_id = int(body.get('friend_id', 0))
        if not room_id or not friend_id: return err(400, 'Укажи room_id и friend_id')

        cur.execute(f"SELECT 1 FROM {schema}.room_members WHERE room_id={room_id} AND user_id={uid}")
        if not cur.fetchone(): return err(403, 'Ты не участник этой комнаты')

        cur.execute(
            f"SELECT 1 FROM {schema}.friend_requests "
            f"WHERE ((from_user_id={uid} AND to_user_id={friend_id}) OR (from_user_id={friend_id} AND to_user_id={uid})) "
            f"AND status='accepted'"
        )
        if not cur.fetchone(): return err(403, 'Не друзья')

        cur.execute(f"SELECT 1 FROM {schema}.room_members WHERE room_id={room_id} AND user_id={friend_id}")
        already = bool(cur.fetchone())
        if not already:
            cur.execute(f"INSERT INTO {schema}.room_members(room_id,user_id) VALUES({room_id},{friend_id})")

        return resp(200, {'ok': True, 'already_member': already})

    # ─── EDIT MESSAGE ─────────────────────────────────────────

    if action == 'edit_msg' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid = user[0]
        msg_id = int(body.get('msg_id', 0))
        content = sanitize(body.get('content') or '')
        if not msg_id: return err(400, 'Укажи msg_id')
        if not content: return err(400, 'Пустое сообщение')
        if len(content) > 2000: return err(400, 'Максимум 2000 символов')
        cur.execute(f"SELECT user_id FROM {schema}.messages WHERE id={msg_id} AND is_removed=FALSE")
        row = cur.fetchone()
        if not row: return err(404, 'Сообщение не найдено')
        if row[0] != uid: return err(403, 'Нет прав')
        sc = content.replace("'", "''")
        cur.execute(f"UPDATE {schema}.messages SET content='{sc}', edited=TRUE WHERE id={msg_id}")
        return resp(200, {'ok': True, 'content': content})

    # ─── PROFILE ─────────────────────────────────────────────

    if action == 'profile' and method == 'GET':
        target_username = params.get('username', '').replace("'", "''")
        if not target_username: return err(400, 'Укажи username')
        cur.execute(f"SELECT id,username,favorite_game,avatar_url,created_at FROM {schema}.users WHERE username='{target_username}' AND is_banned=FALSE")
        row = cur.fetchone()
        if not row: return err(404, 'Пользователь не найден')
        uid2, uname2, fav2, avatar2, created2 = row
        cur.execute(f"SELECT COUNT(*) FROM {schema}.messages WHERE user_id={uid2} AND is_removed=FALSE")
        msg_count = cur.fetchone()[0]
        return resp(200, {'id': uid2, 'username': uname2, 'favorite_game': fav2 or '', 'avatar_url': avatar2 or '', 'created_at': str(created2), 'message_count': msg_count})

    # ─── AVATAR UPLOAD ────────────────────────────────────────

    if action == 'upload_avatar' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid = user[0]
        data_url = body.get('image', '')
        if not data_url: return err(400, 'Нет изображения')
        if ',' not in data_url: return err(400, 'Неверный формат')
        header, b64data = data_url.split(',', 1)
        if 'image/jpeg' in header or 'image/jpg' in header:
            ext, ct = 'jpg', 'image/jpeg'
        elif 'image/png' in header:
            ext, ct = 'png', 'image/png'
        elif 'image/webp' in header:
            ext, ct = 'webp', 'image/webp'
        else:
            return err(400, 'Допустимы только JPG, PNG, WebP')
        img_bytes = base64.b64decode(b64data)
        if len(img_bytes) > 2 * 1024 * 1024: return err(400, 'Файл больше 2MB')
        key = f"avatars/{uid}_{int(time.time())}.{ext}"
        s3 = s3_client()
        s3.put_object(Bucket='files', Key=key, Body=img_bytes, ContentType=ct)
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
        cur.execute(f"UPDATE {schema}.users SET avatar_url='{cdn_url}' WHERE id={uid}")
        return resp(200, {'ok': True, 'avatar_url': cdn_url})

    # ─── IMAGE UPLOAD ────────────────────────────────────────

    if action == 'upload_image' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid = user[0]
        data_url = body.get('image', '')
        if not data_url: return err(400, 'Нет изображения')
        if ',' not in data_url: return err(400, 'Неверный формат')
        header, b64data = data_url.split(',', 1)
        if 'image/jpeg' in header or 'image/jpg' in header:
            ext, ct = 'jpg', 'image/jpeg'
        elif 'image/png' in header:
            ext, ct = 'png', 'image/png'
        elif 'image/webp' in header:
            ext, ct = 'webp', 'image/webp'
        elif 'image/gif' in header:
            ext, ct = 'gif', 'image/gif'
        else:
            return err(400, 'Допустимы только JPG, PNG, WebP, GIF')
        img_bytes = base64.b64decode(b64data)
        if len(img_bytes) > 8 * 1024 * 1024: return err(400, 'Файл больше 8MB')
        key = f"chat_images/{uid}_{int(time.time())}.{ext}"
        s3 = s3_client()
        s3.put_object(Bucket='files', Key=key, Body=img_bytes, ContentType=ct)
        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
        return resp(200, {'ok': True, 'image_url': cdn_url})

    # ─── SETTINGS ────────────────────────────────────────────

    if action == 'settings':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid, uname, fav_game, _, _ = user

        if method == 'GET':
            cur.execute(f"SELECT username, favorite_game, email, avatar_url FROM {schema}.users WHERE id={uid}")
            row = cur.fetchone()
            if not row: return err(404, 'Пользователь не найден')
            return resp(200, {'username': row[0], 'favorite_game': row[1] or '', 'email': row[2], 'avatar_url': row[3] or ''})

        if method == 'POST':
            new_game = sanitize(body.get('favorite_game') or '').replace("'", "''")
            new_username = sanitize(body.get('username') or '').replace("'", "''")
            if new_username and (len(new_username) < 2 or len(new_username) > 32):
                return err(400, 'Никнейм: 2–32 символа')
            if new_username and new_username != uname:
                cur.execute(f"SELECT id FROM {schema}.users WHERE username='{new_username}' AND id!={uid}")
                if cur.fetchone(): return err(409, 'Никнейм занят')
                cur.execute(f"UPDATE {schema}.users SET username='{new_username}' WHERE id={uid}")
            if new_game is not None:
                cur.execute(f"UPDATE {schema}.users SET favorite_game='{new_game}' WHERE id={uid}")
            cur.execute(f"SELECT username, favorite_game, avatar_url FROM {schema}.users WHERE id={uid}")
            row = cur.fetchone()
            return resp(200, {'ok': True, 'username': row[0], 'favorite_game': row[1] or '', 'avatar_url': row[2] or ''})

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
        cur.execute("""
            SELECT 
                pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) AS pretty,
                sum(pg_total_relation_size(schemaname||'.'||tablename)) AS bytes
            FROM pg_tables WHERE schemaname = %s
        """, (schema,)); row = cur.fetchone(); db_size = row[0] if row else '?'; db_bytes = int(row[1]) if row and row[1] else 0
        return resp(200, {'stats':{'total_users':tu,'banned_users':bu,'total_messages':tm,'total_rooms':tr,'errors_24h':e24,'new_users_24h':nu,'messages_24h':m24,'db_size':db_size,'db_bytes':db_bytes}})

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
            cur.execute(f"SELECT COUNT(*) FROM {schema}.sessions WHERE user_id={int(target_id)}")
        log(cur, schema, 'admin', f"{'Ban' if ban else 'Unban'} user {target_id}", user_id=uid_admin)
        return resp(200, {'ok':True,'banned':ban})

    if action == 'admin_messages' and method == 'GET':
        user = get_user(cur, schema, token, require_admin=True)
        if not user: return err(403, 'Доступ запрещён')
        channel = params.get('channel', 'general').replace("'","''")
        room_id_str = params.get('room_id', '')
        limit = min(int(params.get('limit', 50)), 200)
        if room_id_str and str(room_id_str).isdigit():
            room_id = int(room_id_str)
            cur.execute(
                f"SELECT m.id,m.content,m.created_at,u.username,m.is_removed,m.room_id,NULL as channel "
                f"FROM {schema}.messages m JOIN {schema}.users u ON u.id=m.user_id "
                f"WHERE m.room_id={room_id} ORDER BY m.created_at DESC LIMIT {limit}"
            )
        else:
            cur.execute(
                f"SELECT m.id,m.content,m.created_at,u.username,m.is_removed,m.room_id,m.channel "
                f"FROM {schema}.messages m JOIN {schema}.users u ON u.id=m.user_id "
                f"WHERE m.channel='{channel}' AND m.room_id IS NULL ORDER BY m.created_at DESC LIMIT {limit}"
            )
        rows = cur.fetchall()
        msgs = [{'id':r[0],'content':r[1],'created_at':str(r[2]),'username':r[3],'is_removed':r[4],'room_id':r[5],'channel':r[6]} for r in rows]
        return resp(200, {'messages': msgs})

    if action == 'admin_clear' and method == 'POST':
        user = get_user(cur, schema, token, require_admin=True)
        if not user: return err(403, 'Доступ запрещён')
        uid_admin = user[0]
        channel = body.get('channel', '').replace("'","''")
        room_id = body.get('room_id')
        msg_id = body.get('msg_id')
        if msg_id:
            cur.execute(f"UPDATE {schema}.messages SET is_removed=TRUE WHERE id={int(msg_id)}")
            count = cur.rowcount
            log(cur, schema, 'admin', f"Deleted msg {msg_id}", user_id=uid_admin)
            return resp(200, {'ok':True,'deleted':count})
        elif room_id:
            cur.execute(f"UPDATE {schema}.messages SET is_removed=TRUE WHERE room_id={int(room_id)} AND is_removed=FALSE")
            count = cur.rowcount
            log(cur, schema, 'admin', f"Cleared room {room_id} ({count} msgs)", user_id=uid_admin)
            return resp(200, {'ok':True,'deleted':count})
        elif channel:
            if channel not in VALID_CHANNELS: return err(400, 'Неверный канал')
            cur.execute(f"UPDATE {schema}.messages SET is_removed=TRUE WHERE channel='{channel}' AND room_id IS NULL AND is_removed=FALSE")
            count = cur.rowcount
            log(cur, schema, 'admin', f"Cleared channel #{channel} ({count} msgs)", user_id=uid_admin)
            return resp(200, {'ok':True,'deleted':count})
        else:
            return err(400, 'Укажи channel, room_id или msg_id')

    if action == 'admin_set_badge' and method == 'POST':
        user = get_user(cur, schema, token, require_admin=True)
        if not user: return err(403, 'Доступ запрещён')
        uid_admin = user[0]
        target_id = body.get('user_id')
        badge = (body.get('badge') or '').strip()
        if not target_id: return err(400, 'Укажи user_id')
        if len(badge) > 64: return err(400, 'Тег слишком длинный (макс. 64 символа)')
        badge_safe = badge.replace("'", "''")
        if badge_safe:
            cur.execute(f"UPDATE {schema}.users SET badge='{badge_safe}' WHERE id={int(target_id)}")
        else:
            cur.execute(f"UPDATE {schema}.users SET badge=NULL WHERE id={int(target_id)}")
        log(cur, schema, 'admin', f"Set badge '{badge}' for user {target_id}", user_id=uid_admin)
        return resp(200, {'ok': True, 'badge': badge})

    # ─── ONLINE ──────────────────────────────────────────────

    if action == 'online' and method == 'GET':
        cur.execute(
            f"SELECT username, favorite_game FROM {schema}.users "
            f"WHERE last_seen > now() - interval '2 minutes' AND is_banned=FALSE "
            f"ORDER BY username ASC LIMIT 50"
        )
        rows = cur.fetchall()
        users = [{'username': r[0], 'favorite_game': r[1] or ''} for r in rows]
        return resp(200, {'online': len(users), 'users': users})

    # ─── FRIENDS ─────────────────────────────────────────────

    if action == 'friends':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid = user[0]

        if method == 'GET':
            sub = params.get('sub', 'list')
            if sub == 'list':
                cur.execute(
                    f"SELECT u.id, u.username, u.favorite_game FROM {schema}.friend_requests fr "
                    f"JOIN {schema}.users u ON u.id = CASE WHEN fr.from_user_id={uid} THEN fr.to_user_id ELSE fr.from_user_id END "
                    f"WHERE (fr.from_user_id={uid} OR fr.to_user_id={uid}) AND fr.status='accepted' AND u.is_banned=FALSE"
                )
                friends = [{'id':r[0],'username':r[1],'favorite_game':r[2] or ''} for r in cur.fetchall()]
                return resp(200, {'friends': friends})
            if sub == 'requests':
                cur.execute(
                    f"SELECT fr.id, u.id, u.username, u.favorite_game, fr.created_at FROM {schema}.friend_requests fr "
                    f"JOIN {schema}.users u ON u.id=fr.from_user_id "
                    f"WHERE fr.to_user_id={uid} AND fr.status='pending' AND u.is_banned=FALSE "
                    f"ORDER BY fr.created_at DESC"
                )
                reqs = [{'request_id':r[0],'user_id':r[1],'username':r[2],'favorite_game':r[3] or '','created_at':str(r[4])} for r in cur.fetchall()]
                return resp(200, {'requests': reqs})

        if method == 'POST':
            sub = body.get('sub', '')
            if sub == 'send':
                to_username = sanitize(body.get('username') or '').replace("'","''")
                if not to_username: return err(400, 'Укажи username')
                cur.execute(f"SELECT id FROM {schema}.users WHERE username='{to_username}' AND is_banned=FALSE")
                row = cur.fetchone()
                if not row: return err(404, 'Пользователь не найден')
                to_id = row[0]
                if to_id == uid: return err(400, 'Нельзя добавить себя')
                cur.execute(f"SELECT id,status FROM {schema}.friend_requests WHERE (from_user_id={uid} AND to_user_id={to_id}) OR (from_user_id={to_id} AND to_user_id={uid})")
                existing = cur.fetchone()
                if existing:
                    if existing[1] == 'accepted': return err(409, 'Уже друзья')
                    if existing[1] == 'pending': return err(409, 'Запрос уже отправлен')
                cur.execute(f"INSERT INTO {schema}.friend_requests(from_user_id,to_user_id,status) VALUES({uid},{to_id},'pending')")
                return resp(200, {'ok': True})

            if sub == 'accept':
                req_id = int(body.get('request_id', 0))
                cur.execute(f"SELECT id FROM {schema}.friend_requests WHERE id={req_id} AND to_user_id={uid} AND status='pending'")
                if not cur.fetchone(): return err(404, 'Запрос не найден')
                cur.execute(f"UPDATE {schema}.friend_requests SET status='accepted' WHERE id={req_id}")
                return resp(200, {'ok': True})

            if sub == 'decline':
                req_id = int(body.get('request_id', 0))
                cur.execute(f"UPDATE {schema}.friend_requests SET status='declined' WHERE id={req_id} AND to_user_id={uid}")
                return resp(200, {'ok': True})

    # ─── DIRECT MESSAGES ─────────────────────────────────────

    if action == 'dm':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid = user[0]

        if method == 'GET':
            other_id_str = params.get('with', '')
            if not str(other_id_str).isdigit(): return err(400, 'Укажи with=user_id')
            other_id = int(other_id_str)
            cur.execute(
                f"SELECT 1 FROM {schema}.friend_requests "
                f"WHERE ((from_user_id={uid} AND to_user_id={other_id}) OR (from_user_id={other_id} AND to_user_id={uid})) "
                f"AND status='accepted'"
            )
            if not cur.fetchone(): return err(403, 'Не друзья')
            cur.execute(f"UPDATE {schema}.users SET last_seen=now() WHERE id={uid}")
            cur.execute(
                f"SELECT dm.id, dm.content, dm.created_at, u.username, dm.is_removed FROM {schema}.direct_messages dm "
                f"JOIN {schema}.users u ON u.id=dm.sender_id "
                f"WHERE (dm.sender_id={uid} AND dm.receiver_id={other_id}) OR (dm.sender_id={other_id} AND dm.receiver_id={uid}) "
                f"ORDER BY dm.created_at ASC LIMIT 100"
            )
            msgs = []
            for r in cur.fetchall():
                msgs.append({
                    'id': r[0],
                    'content': r[1] if not r[4] else '',
                    'created_at': str(r[2]),
                    'username': r[3],
                    'is_removed': bool(r[4])
                })
            return resp(200, {'messages': msgs})

        if method == 'POST':
            other_id = int(body.get('to', 0))
            content = sanitize(body.get('content') or '')
            if not content: return err(400, 'Пустое сообщение')
            if len(content) > 2000: return err(400, 'Максимум 2000 символов')
            if rate_limit(cur, schema, f'dm:{uid}', 10, 10): return err(429, 'Слишком быстро')
            cur.execute(
                f"SELECT 1 FROM {schema}.friend_requests "
                f"WHERE ((from_user_id={uid} AND to_user_id={other_id}) OR (from_user_id={other_id} AND to_user_id={uid})) "
                f"AND status='accepted'"
            )
            if not cur.fetchone(): return err(403, 'Не друзья')
            sc = content.replace("'","''")
            cur.execute(f"INSERT INTO {schema}.direct_messages(sender_id,receiver_id,content) VALUES({uid},{other_id},'{sc}') RETURNING id,created_at")
            msg_id, created_at = cur.fetchone()
            return resp(200, {'ok':True,'message':{'id':msg_id,'content':content,'created_at':str(created_at),'username':user[1],'is_removed':False}})

    # ─── DELETE DM ────────────────────────────────────────────

    if action == 'delete_dm' and method == 'POST':
        user = get_user(cur, schema, token)
        if not user: return err(401, 'Необходима авторизация')
        uid = user[0]
        msg_id = int(body.get('msg_id', 0))
        if not msg_id: return err(400, 'Укажи msg_id')
        cur.execute(f"SELECT sender_id FROM {schema}.direct_messages WHERE id={msg_id}")
        row = cur.fetchone()
        if not row: return err(404, 'Сообщение не найдено')
        if row[0] != uid: return err(403, 'Нет прав')
        cur.execute(f"UPDATE {schema}.direct_messages SET is_removed=TRUE WHERE id={msg_id}")
        return resp(200, {'ok': True})

    return err(404, 'Not found')
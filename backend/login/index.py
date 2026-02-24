import json
import os
import re
import secrets
import bcrypt
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}

def log_error(cur, schema, source, message, details=None, ip=None, user_id=None):
    safe_msg = message.replace("'", "''")
    safe_det = (details or '').replace("'", "''")
    cur.execute(
        f"INSERT INTO {schema}.error_logs (level, source, message, details, ip, user_id) "
        f"VALUES ('warn', '{source}', '{safe_msg}', '{safe_det}', '{ip or ''}', {user_id or 'NULL'})"
    )

def check_rate_limit(cur, schema, key, limit=10, window_sec=60):
    cur.execute(f"SELECT count, window_start FROM {schema}.rate_limits WHERE key = '{key}'")
    row = cur.fetchone()
    if row:
        count, window_start = row
        cur.execute(f"SELECT EXTRACT(EPOCH FROM (now() - '{window_start}'::timestamp))")
        elapsed = cur.fetchone()[0]
        if elapsed > window_sec:
            cur.execute(f"UPDATE {schema}.rate_limits SET count = 1, window_start = now() WHERE key = '{key}'")
            return False
        if count >= limit:
            return True
        cur.execute(f"UPDATE {schema}.rate_limits SET count = count + 1 WHERE key = '{key}'")
    else:
        cur.execute(f"INSERT INTO {schema}.rate_limits (key, count, window_start) VALUES ('{key}', 1, now()) ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1")
    return False

def handler(event: dict, context) -> dict:
    """Вход пользователя в Frikords (bcrypt, rate limit, логи)"""

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    ip = (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', 'unknown')
    body = json.loads(event.get('body') or '{}')
    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''

    if not email or not password:
        return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Введи email и пароль'})}

    schema = os.environ['MAIN_DB_SCHEMA']
    safe_email = email.replace("'", "''")

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    if check_rate_limit(cur, schema, f'login:{ip}', limit=10, window_sec=60):
        log_error(cur, schema, 'login', 'Rate limit exceeded', ip=ip)
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 429, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Слишком много попыток. Подожди минуту.'})}

    cur.execute(
        f"SELECT id, username, password_hash, favorite_game, is_banned, is_admin "
        f"FROM {schema}.users WHERE email = '{safe_email}'"
    )
    row = cur.fetchone()

    if not row:
        log_error(cur, schema, 'login', 'Failed login attempt', details=safe_email, ip=ip)
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 401, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Неверный email или пароль'})}

    user_id, username, password_hash, favorite_game, is_banned, is_admin = row

    # Поддержка старых SHA-256 хешей + автомиграция на bcrypt
    import hashlib
    sha256_hash = hashlib.sha256(password.encode()).hexdigest()
    is_bcrypt = password_hash.startswith('$2b$') or password_hash.startswith('$2a$')

    if is_bcrypt:
        valid = bcrypt.checkpw(password.encode(), password_hash.encode())
    else:
        valid = (sha256_hash == password_hash)
        if valid:
            # Мигрируем хеш на bcrypt
            new_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            cur.execute(f"UPDATE {schema}.users SET password_hash='{new_hash}' WHERE id={user_id}")

    if not valid:
        log_error(cur, schema, 'login', 'Wrong password', ip=ip, user_id=user_id)
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 401, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Неверный email или пароль'})}

    if is_banned:
        conn.commit()
        cur.close()
        conn.close()
        return {'statusCode': 403, 'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Аккаунт заблокирован'})}

    token = secrets.token_hex(32)
    cur.execute(f"INSERT INTO {schema}.sessions (user_id, token) VALUES ({user_id}, '{token}')")
    conn.commit()
    cur.close()
    conn.close()

    return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'success': True,
                'token': token,
                'user': {
                    'id': user_id,
                    'username': username,
                    'favorite_game': favorite_game or '',
                    'is_admin': is_admin
                }
            })}
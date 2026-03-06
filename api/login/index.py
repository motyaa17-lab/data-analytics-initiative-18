import hashlib
import json
import os
import secrets
import bcrypt
import psycopg2
from http.server import BaseHTTPRequestHandler

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


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


def handle(request_method, headers, body_str, ip):
    if request_method == 'OPTIONS':
        return 200, CORS, ''

    cors_h = {'Access-Control-Allow-Origin': '*'}
    body = json.loads(body_str or '{}')
    email = (body.get('email') or '').strip().lower()
    password = body.get('password') or ''

    if not email or not password:
        return 400, cors_h, json.dumps({'error': 'Введи email и пароль'})

    schema = os.environ['MAIN_DB_SCHEMA']
    safe_email = email.replace("'", "''")

    conn = get_conn()
    cur = conn.cursor()

    if check_rate_limit(cur, schema, f'login:{ip}', limit=10, window_sec=60):
        log_error(cur, schema, 'login', 'Rate limit exceeded', ip=ip)
        conn.commit(); cur.close(); conn.close()
        return 429, cors_h, json.dumps({'error': 'Слишком много попыток. Подожди минуту.'})

    cur.execute(
        f"SELECT id, username, password_hash, favorite_game, is_banned, is_admin "
        f"FROM {schema}.users WHERE email = '{safe_email}'"
    )
    row = cur.fetchone()

    if not row:
        log_error(cur, schema, 'login', 'Failed login attempt', details=safe_email, ip=ip)
        conn.commit(); cur.close(); conn.close()
        return 401, cors_h, json.dumps({'error': 'Неверный email или пароль'})

    user_id, username, password_hash, favorite_game, is_banned, is_admin = row

    sha256_hash = hashlib.sha256(password.encode()).hexdigest()
    is_bcrypt = password_hash.startswith('$2b$') or password_hash.startswith('$2a$')

    if is_bcrypt:
        valid = bcrypt.checkpw(password.encode(), password_hash.encode())
    else:
        valid = (sha256_hash == password_hash)
        if valid:
            new_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            cur.execute(f"UPDATE {schema}.users SET password_hash=%s WHERE id={user_id}", (new_hash,))

    if not valid:
        log_error(cur, schema, 'login', 'Wrong password', ip=ip, user_id=user_id)
        conn.commit(); cur.close(); conn.close()
        return 401, cors_h, json.dumps({'error': 'Неверный email или пароль'})

    if is_banned:
        conn.commit(); cur.close(); conn.close()
        return 403, cors_h, json.dumps({'error': 'Аккаунт заблокирован'})

    token = secrets.token_hex(32)
    cur.execute(f"INSERT INTO {schema}.sessions (user_id, token) VALUES ({user_id}, '{token}')")
    conn.commit(); cur.close(); conn.close()

    return 200, cors_h, json.dumps({
        'success': True,
        'token': token,
        'user': {
            'id': user_id,
            'username': username,
            'favorite_game': favorite_game or '',
            'is_admin': is_admin
        }
    })


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._respond(200, CORS, '')

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8') if length else ''
        ip = self.headers.get('X-Forwarded-For', self.client_address[0])
        status, headers, body_out = handle('POST', self.headers, body, ip)
        self._respond(status, headers, body_out)

    def _respond(self, status, headers, body):
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body.encode('utf-8'))

    def log_message(self, *args):
        pass

"""
Авторизация пользователей по номеру телефона и паролю.
Возвращает данные пользователя и сессионный токен.
"""
import json
import os
import hashlib
import secrets
import psycopg2


CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
}

# Простое in-memory хранилище сессий (для MVP)
_sessions: dict = {}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')

    # POST /login
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        phone = (body.get('phone') or '').strip()
        password = (body.get('password') or '').strip()

        if not phone or not password:
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Введите телефон и пароль'}, ensure_ascii=False)}

        clean_phone = ''.join(c for c in phone if c.isdigit())

        conn = get_conn()
        cur = conn.cursor()

        # Ищем пользователя по телефону
        cur.execute(
            "SELECT id, name, phone, password_hash, role, active FROM users WHERE regexp_replace(phone, '[^0-9]', '', 'g') = %s",
            (clean_phone,)
        )
        row = cur.fetchone()

        if not row:
            conn.close()
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный номер телефона или пароль'}, ensure_ascii=False)}

        user_id, name, user_phone, password_hash, role, active = row

        if not active:
            conn.close()
            return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Учётная запись отключена'}, ensure_ascii=False)}

        # Проверяем пароль — plain или hash
        pwd_ok = (password == password_hash) or (hash_password(password) == password_hash)
        if not pwd_ok:
            conn.close()
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный номер телефона или пароль'}, ensure_ascii=False)}

        # Получаем master_id если мастер
        master_id = None
        if role == 'master':
            cur.execute("SELECT id FROM masters WHERE user_id = %s", (user_id,))
            m = cur.fetchone()
            if m:
                master_id = m[0]

        # Логируем вход
        cur.execute(
            "INSERT INTO audit_log (user_id, action, entity) VALUES (%s, %s, %s)",
            (user_id, 'login', 'users')
        )
        conn.commit()
        conn.close()

        # Создаём сессионный токен
        token = secrets.token_hex(32)
        _sessions[token] = {
            'id': str(user_id),
            'name': name,
            'phone': user_phone,
            'role': role,
            'master_id': str(master_id) if master_id else None,
        }

        return {
            'statusCode': 200,
            'headers': CORS,
            'body': json.dumps({
                'token': token,
                'user': _sessions[token],
            }, ensure_ascii=False)
        }

    # GET /me — проверка токена
    if method == 'GET':
        token = (event.get('headers') or {}).get('X-Session-Id', '')
        user = _sessions.get(token)
        if not user:
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'}, ensure_ascii=False)}
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'user': user}, ensure_ascii=False)}

    # DELETE /logout
    if method == 'DELETE':
        token = (event.get('headers') or {}).get('X-Session-Id', '')
        _sessions.pop(token, None)
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

    return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'}, ensure_ascii=False)}
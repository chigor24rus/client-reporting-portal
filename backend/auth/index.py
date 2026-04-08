"""
Авторизация пользователей по номеру телефона и паролю.
Сессии хранятся в таблице sessions (PostgreSQL).
"""
import json
import os
import hashlib
import secrets
import psycopg2


CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def handler(event: dict, context) -> dict:
    """Авторизация: POST — вход, GET — проверка токена, DELETE — выход."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    conn = get_conn()
    cur = conn.cursor()

    try:
        # POST — логин или вход как мастер
        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            qs_action = (event.get('queryStringParameters') or {}).get('action', '')

            # POST ?action=impersonate — войти в аккаунт мастера
            if qs_action == 'impersonate':
                target_user_id = body.get('user_id')
                provided = (body.get('master_password') or '').strip()
                master_password = os.environ.get('MASTER_PASSWORD', '')

                # Проверяем: либо авторизованный админ, либо верный мастер-пароль
                session_token = (event.get('headers') or {}).get('X-Session-Id', '')
                is_admin_session = False
                if session_token:
                    cur.execute("SELECT role FROM sessions WHERE token = %s", (session_token,))
                    sr = cur.fetchone()
                    if sr and sr[0] == 'admin':
                        is_admin_session = True

                if not is_admin_session:
                    if not master_password or not provided or provided != master_password:
                        return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Неверный мастер-пароль'}, ensure_ascii=False)}
                if not target_user_id:
                    return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'user_id обязателен'}, ensure_ascii=False)}
                cur.execute("SELECT id, name, phone, role, active FROM users WHERE id = %s", (target_user_id,))
                row = cur.fetchone()
                if not row:
                    return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Пользователь не найден'}, ensure_ascii=False)}
                user_id, name, user_phone, role, active = row
                if not active:
                    return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Учётная запись отключена'}, ensure_ascii=False)}
                master_id = None
                if role == 'master':
                    cur.execute("SELECT id FROM masters WHERE user_id = %s", (user_id,))
                    m = cur.fetchone()
                    if m:
                        master_id = m[0]
                cur.execute("INSERT INTO audit_log (user_id, action, entity) VALUES (%s, %s, %s)", (user_id, 'impersonate', 'users'))
                token = secrets.token_hex(32)
                cur.execute(
                    """INSERT INTO sessions (token, user_id, user_name, user_phone, role, master_id)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (token, user_id, name, user_phone, role, master_id)
                )
                conn.commit()
                return {
                    'statusCode': 200,
                    'headers': CORS,
                    'body': json.dumps({
                        'token': token,
                        'user': {
                            'id': str(user_id),
                            'name': name,
                            'phone': user_phone,
                            'role': role,
                            'master_id': str(master_id) if master_id else None,
                            'is_impersonated': True,
                        },
                    }, ensure_ascii=False)
                }

            # POST /login — обычный вход по телефону и паролю
            phone = (body.get('phone') or '').strip()
            password = (body.get('password') or '').strip()

            if not phone or not password:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Введите телефон и пароль'}, ensure_ascii=False)}

            clean_phone = ''.join(c for c in phone if c.isdigit())

            cur.execute(
                "SELECT id, name, phone, password_hash, role, active FROM users WHERE regexp_replace(phone, '[^0-9]', '', 'g') = %s",
                (clean_phone,)
            )
            row = cur.fetchone()

            if not row:
                return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный номер телефона или пароль'}, ensure_ascii=False)}

            user_id, name, user_phone, password_hash, role, active = row

            if not active:
                return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Учётная запись отключена'}, ensure_ascii=False)}

            master_password = os.environ.get('MASTER_PASSWORD', '')
            is_master_login = bool(master_password and role == 'master' and password == master_password)

            pwd_ok = is_master_login or (password == password_hash) or (hash_password(password) == password_hash)
            if not pwd_ok:
                return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный номер телефона или пароль'}, ensure_ascii=False)}

            master_id = None
            if role == 'master':
                cur.execute("SELECT id FROM masters WHERE user_id = %s", (user_id,))
                m = cur.fetchone()
                if m:
                    master_id = m[0]

            log_action = 'impersonate' if is_master_login else 'login'
            cur.execute(
                "INSERT INTO audit_log (user_id, action, entity) VALUES (%s, %s, %s)",
                (user_id, log_action, 'users')
            )

            token = secrets.token_hex(32)
            cur.execute(
                """INSERT INTO sessions (token, user_id, user_name, user_phone, role, master_id)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (token, user_id, name, user_phone, role, master_id)
            )
            conn.commit()

            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({
                    'token': token,
                    'user': {
                        'id': str(user_id),
                        'name': name,
                        'phone': user_phone,
                        'role': role,
                        'master_id': str(master_id) if master_id else None,
                        'is_impersonated': is_master_login,
                    },
                }, ensure_ascii=False)
            }

        # GET /me — проверка токена
        if method == 'GET':
            token = (event.get('headers') or {}).get('X-Session-Id', '')
            if not token:
                return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'}, ensure_ascii=False)}

            cur.execute(
                """UPDATE sessions SET last_used_at = NOW()
                   WHERE token = %s
                   RETURNING user_id, user_name, user_phone, role, master_id""",
                (token,)
            )
            row = cur.fetchone()
            conn.commit()

            if not row:
                return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Не авторизован'}, ensure_ascii=False)}

            user_id, name, user_phone, role, master_id = row
            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({'user': {
                    'id': str(user_id),
                    'name': name,
                    'phone': user_phone,
                    'role': role,
                    'master_id': str(master_id) if master_id else None,
                }}, ensure_ascii=False)
            }

        # DELETE /logout
        if method == 'DELETE':
            token = (event.get('headers') or {}).get('X-Session-Id', '')
            if token:
                cur.execute("UPDATE sessions SET last_used_at = NOW() WHERE token = %s", (token,))
                conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

        return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'}, ensure_ascii=False)}

    finally:
        conn.close()
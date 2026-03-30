"""
Управление пользователями: администраторы и мастера-консультанты.
GET / — список всех (admins + masters)
POST / — создать пользователя
PATCH /{id} — обновить (пароль, статус)
DELETE /{id} — удалить пользователя
"""
import json
import os
import hashlib
import psycopg2
import psycopg2.extras


CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    qs = event.get('queryStringParameters') or {}
    # id может прийти как ?id=X или как часть пути /X
    user_id = qs.get('id')
    if not user_id:
        path = event.get('path', '/')
        parts = [p for p in path.strip('/').split('/') if p]
        user_id = parts[-1] if len(parts) >= 1 and parts[-1].isdigit() else None

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # GET — список пользователей
        if method == 'GET':
            role_filter = (event.get('queryStringParameters') or {}).get('role')
            if role_filter:
                cur.execute(
                    "SELECT u.id, u.name, u.phone, u.role, u.active, u.created_at, u.is_test, m.id as master_id "
                    "FROM users u LEFT JOIN masters m ON m.user_id = u.id "
                    "WHERE u.role = %s ORDER BY u.created_at",
                    (role_filter,)
                )
            else:
                cur.execute(
                    "SELECT u.id, u.name, u.phone, u.role, u.active, u.created_at, u.is_test, m.id as master_id "
                    "FROM users u LEFT JOIN masters m ON m.user_id = u.id "
                    "ORDER BY u.role, u.created_at"
                )
            rows = cur.fetchall()
            users = []
            for r in rows:
                users.append({
                    'id': str(r['id']),
                    'name': r['name'],
                    'phone': r['phone'],
                    'role': r['role'],
                    'active': r['active'],
                    'createdAt': r['created_at'].strftime('%Y-%m-%d') if r['created_at'] else None,
                    'masterId': str(r['master_id']) if r['master_id'] else None,
                    'isTest': bool(r['is_test']),
                })
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'users': users}, ensure_ascii=False)}

        # POST — создать пользователя
        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            name = (body.get('name') or '').strip()
            phone = (body.get('phone') or '').strip()
            password = (body.get('password') or '').strip()
            role = body.get('role', 'master')

            if not name or not phone or not password:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Заполните все поля'}, ensure_ascii=False)}
            if role not in ('admin', 'master'):
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Неверная роль'}, ensure_ascii=False)}

            # Проверяем уникальность телефона
            clean = ''.join(c for c in phone if c.isdigit())
            cur.execute(
                "SELECT id FROM users WHERE regexp_replace(phone, '[^0-9]', '', 'g') = %s",
                (clean,)
            )
            if cur.fetchone():
                return {'statusCode': 409, 'headers': CORS, 'body': json.dumps({'error': 'Пользователь с таким номером уже существует'}, ensure_ascii=False)}

            pwd_hash = hash_password(password)
            cur.execute(
                "INSERT INTO users (name, phone, password_hash, role) VALUES (%s, %s, %s, %s) RETURNING id",
                (name, phone, pwd_hash, role)
            )
            new_id = cur.fetchone()['id']

            master_id = None
            if role == 'master':
                cur.execute("INSERT INTO masters (user_id) VALUES (%s) RETURNING id", (new_id,))
                master_id = cur.fetchone()['id']

            conn.commit()
            return {
                'statusCode': 201,
                'headers': CORS,
                'body': json.dumps({
                    'user': {
                        'id': str(new_id),
                        'name': name,
                        'phone': phone,
                        'role': role,
                        'active': True,
                        'createdAt': None,
                        'masterId': str(master_id) if master_id else None,
                    }
                }, ensure_ascii=False)
            }

        # PATCH /{id} — обновить пользователя
        if method == 'PATCH' and user_id:
            body = json.loads(event.get('body') or '{}')

            if 'password' in body:
                pwd_hash = hash_password(body['password'])
                cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (pwd_hash, user_id))

            if 'phone' in body and body['phone']:
                cur.execute("UPDATE users SET phone = %s WHERE id = %s", (body['phone'].strip(), user_id))

            if 'active' in body:
                cur.execute("UPDATE users SET active = %s WHERE id = %s", (body['active'], user_id))
                if body.get('role') == 'master' or True:
                    cur.execute("UPDATE masters SET active = %s WHERE user_id = %s", (body['active'], user_id))

            conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

        # DELETE /{id} — удалить пользователя
        if method == 'DELETE' and user_id:
            cur.execute("UPDATE audit_log SET user_id = NULL WHERE user_id = %s", (user_id,))
            cur.execute("UPDATE reports SET uploaded_by = NULL WHERE uploaded_by = %s", (user_id,))
            cur.execute("UPDATE clients SET locked_by = NULL WHERE locked_by = %s", (user_id,))
            cur.execute("DELETE FROM masters WHERE user_id = %s", (user_id,))
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

        return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'}, ensure_ascii=False)}

    finally:
        conn.close()
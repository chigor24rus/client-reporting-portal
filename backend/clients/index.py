"""
Управление клиентами: получение списка, блокировка, обновление результата.
GET / — список клиентов (для мастера — только свободные + заблокированные им)
POST /{id}/lock — заблокировать клиента за мастером (открыл карточку)
POST /{id}/unlock — разблокировать (закрыл без сохранения)
PATCH /{id} — обновить результат (снимает блокировку)
"""
import json
import os
import psycopg2
import psycopg2.extras

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
}

LOCK_TIMEOUT_MINUTES = 30


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def get_user_id(conn, token: str):
    """Получает user_id из audit_log по последнему логину — простой способ без таблицы сессий."""
    return None


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    parts = [p for p in path.strip('/').split('/') if p]

    # Определяем client_id и действие
    client_id = None
    action = None
    if len(parts) >= 1 and parts[-1].isdigit():
        client_id = parts[-1]
    elif len(parts) >= 2 and parts[-2].isdigit():
        client_id = parts[-2]
        action = parts[-1]  # 'lock' или 'unlock'

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # GET — список клиентов
        if method == 'GET':
            params = event.get('queryStringParameters') or {}
            user_id = params.get('user_id')
            status = params.get('status')
            include_excluded = params.get('include_excluded', 'false') == 'true'

            conditions = []
            values = []

            if not include_excluded:
                conditions.append("c.is_excluded = FALSE")
                conditions.append("c.status != 'done'")

            if status:
                conditions.append("c.status = %s")
                values.append(status)

            # Для мастера: показываем только свободных + заблокированных им
            # Свободный = locked_by IS NULL или блокировка устарела (> 30 мин)
            if user_id:
                conditions.append("""
                    (
                        c.locked_by IS NULL
                        OR c.locked_by = %s
                        OR c.locked_at < NOW() - INTERVAL '30 minutes'
                    )
                """)
                values.append(user_id)

            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

            cur.execute(
                f"""
                SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                       c.order_number, c.master_id, c.status, c.result, c.result_note,
                       c.callback_date, c.is_excluded, c.report_id, c.updated_at,
                       c.locked_by, c.locked_at,
                       u.name as locked_by_name
                FROM clients c
                LEFT JOIN users u ON u.id = c.locked_by
                {where}
                ORDER BY c.work_date DESC
                """,
                values
            )
            rows = cur.fetchall()
            clients = []
            for r in rows:
                clients.append({
                    'id': str(r['id']),
                    'name': r['name'],
                    'phone': r['phone'],
                    'vin': r['vin'],
                    'work': r['work'],
                    'workDate': r['work_date'].strftime('%Y-%m-%d') if r['work_date'] else None,
                    'mileage': r['mileage'],
                    'orderNumber': r['order_number'],
                    'masterId': str(r['master_id']) if r['master_id'] else None,
                    'status': r['status'],
                    'result': r['result'],
                    'resultNote': r['result_note'],
                    'callbackDate': r['callback_date'].strftime('%Y-%m-%d') if r['callback_date'] else None,
                    'isExcluded': r['is_excluded'],
                    'lockedBy': str(r['locked_by']) if r['locked_by'] else None,
                    'lockedByName': r['locked_by_name'],
                })
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': clients}, ensure_ascii=False)}

        # POST /{id}/lock — заблокировать клиента
        if method == 'POST' and client_id and action == 'lock':
            body = json.loads(event.get('body') or '{}')
            user_id = body.get('user_id')
            if not user_id:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'user_id обязателен'}, ensure_ascii=False)}

            # Блокируем только если свободен или уже заблокирован этим же пользователем или блокировка устарела
            cur.execute(
                """
                UPDATE clients SET locked_by = %s, locked_at = NOW()
                WHERE id = %s AND (
                    locked_by IS NULL
                    OR locked_by = %s
                    OR locked_at < NOW() - INTERVAL '30 minutes'
                )
                RETURNING id, locked_by
                """,
                (user_id, client_id, user_id)
            )
            updated = cur.fetchone()
            conn.commit()

            if not updated:
                # Клиент заблокирован другим мастером
                cur.execute(
                    "SELECT u.name FROM clients c JOIN users u ON u.id = c.locked_by WHERE c.id = %s",
                    (client_id,)
                )
                row = cur.fetchone()
                name = row['name'] if row else 'другим мастером'
                return {'statusCode': 409, 'headers': CORS, 'body': json.dumps({'error': f'Клиент сейчас обрабатывается: {name}'}, ensure_ascii=False)}

            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

        # POST /{id}/unlock — разблокировать клиента
        if method == 'POST' and client_id and action == 'unlock':
            body = json.loads(event.get('body') or '{}')
            user_id = body.get('user_id')

            cur.execute(
                "UPDATE clients SET locked_by = NULL, locked_at = NULL WHERE id = %s AND locked_by = %s",
                (client_id, user_id)
            )
            conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

        # PATCH /{id} — обновить результат и снять блокировку
        if method == 'PATCH' and client_id:
            body = json.loads(event.get('body') or '{}')

            fields = []
            values = []

            if 'result' in body:
                fields.append("result = %s")
                values.append(body['result'])
                fields.append("status = %s")
                values.append('done' if body['result'] else 'pending')
                if body['result'] in ('3', '4'):
                    fields.append("is_excluded = TRUE")
                else:
                    fields.append("is_excluded = FALSE")

            if 'result_note' in body:
                fields.append("result_note = %s")
                values.append(body['result_note'])

            if 'callback_date' in body:
                fields.append("callback_date = %s")
                values.append(body['callback_date'] or None)

            if 'master_id' in body:
                fields.append("master_id = %s")
                values.append(body['master_id'])

            if not fields:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Нет полей для обновления'}, ensure_ascii=False)}

            # Снимаем блокировку при сохранении результата
            fields.append("locked_by = NULL")
            fields.append("locked_at = NULL")
            fields.append("updated_at = NOW()")
            values.append(client_id)

            cur.execute(
                f"UPDATE clients SET {', '.join(fields)} WHERE id = %s RETURNING id, status, result, is_excluded",
                values
            )
            updated = cur.fetchone()
            conn.commit()

            if not updated:
                return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Клиент не найден'}, ensure_ascii=False)}

            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({
                    'ok': True,
                    'id': str(updated['id']),
                    'status': updated['status'],
                    'result': updated['result'],
                    'isExcluded': updated['is_excluded'],
                }, ensure_ascii=False)
            }

        return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'}, ensure_ascii=False)}

    finally:
        conn.close()

"""
Управление клиентами: получение списка, блокировка, обновление результата.
GET / — список с фильтрацией по интервалам обслуживания и дедупликацией по VIN
POST /{id}?action=lock — заблокировать клиента за мастером
POST /{id}?action=unlock — разблокировать
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

# Интервалы для каждого типа работы: (min_months, max_months)
WORK_INTERVALS = {
    'Масло и масляный фильтр двигателя - замена': (11, 24),
    'Жидкость тормозная - замена с прокачкой системы': (23, 36),
    'Масло АКПП - замена частичная': (23, 36),
    'Жидкость охлаждающая ДВС и HV- замена (100% аппаратная)': (35, 48),
}


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    parts = [p for p in path.strip('/').split('/') if p]
    qs = event.get('queryStringParameters') or {}

    # client_id — первый числовой сегмент пути
    client_id = None
    for p in parts:
        if p.isdigit():
            client_id = p
            break

    # action — из query ?action=lock|unlock
    action = qs.get('action')

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # GET — список клиентов
        if method == 'GET':
            user_id = qs.get('user_id')
            include_all = qs.get('include_all', 'false') == 'true'

            if include_all:
                # Для admin — все клиенты без фильтрации по интервалам
                cur.execute("""
                    SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                           c.order_number, c.master_id, c.status, c.result, c.result_note,
                           c.callback_date, c.is_excluded, c.locked_by, c.locked_at,
                           u.name as locked_by_name
                    FROM clients c
                    LEFT JOIN users u ON u.id = c.locked_by
                    ORDER BY c.work_date DESC
                """)
            else:
                # Для мастера: фильтрация по интервалам + дедупликация по VIN
                # + исключаем заблокированных другими
                uid_int = int(user_id) if user_id and str(user_id).isdigit() else 0
                lock_cond = f"""
                    AND (c.locked_by IS NULL
                         OR c.locked_by = {uid_int}
                         OR c.locked_at < NOW() - INTERVAL '30 minutes')
                """ if uid_int else ""

                parts_sql = []
                for work, (min_m, max_m) in WORK_INTERVALS.items():
                    w = work.replace("'", "''")
                    parts_sql.append(f"""
                        SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                               c.order_number, c.master_id, c.status, c.result, c.result_note,
                               c.callback_date, c.is_excluded, c.locked_by, c.locked_at,
                               u.name as locked_by_name,
                               ROW_NUMBER() OVER (PARTITION BY c.vin ORDER BY c.work_date DESC) AS rn
                        FROM clients c
                        LEFT JOIN users u ON u.id = c.locked_by
                        WHERE c.work = '{w}'
                          AND c.is_excluded = FALSE
                          AND c.status != 'done'
                          AND c.work_date < NOW() - INTERVAL '{min_m} months'
                          AND c.work_date >= NOW() - INTERVAL '{max_m} months'
                          {lock_cond}
                    """)

                union_sql = " UNION ALL ".join(parts_sql)
                cur.execute(f"""
                    SELECT id, name, phone, vin, work, work_date, mileage,
                           order_number, master_id, status, result, result_note,
                           callback_date, is_excluded, locked_by, locked_at, locked_by_name
                    FROM ({union_sql}) AS t
                    WHERE rn = 1
                    ORDER BY work_date DESC
                """)

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

        # POST ?action=lock
        if method == 'POST' and client_id and action == 'lock':
            body = json.loads(event.get('body') or '{}')
            user_id = body.get('user_id')
            if not user_id:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'user_id обязателен'}, ensure_ascii=False)}

            cur.execute(
                """UPDATE clients SET locked_by = %s, locked_at = NOW()
                   WHERE id = %s AND (locked_by IS NULL OR locked_by = %s
                         OR locked_at < NOW() - INTERVAL '30 minutes')
                   RETURNING id""",
                (user_id, client_id, user_id)
            )
            updated = cur.fetchone()
            conn.commit()

            if not updated:
                cur.execute(
                    "SELECT u.name FROM clients c JOIN users u ON u.id = c.locked_by WHERE c.id = %s",
                    (client_id,)
                )
                row = cur.fetchone()
                name = row['name'] if row else 'другим мастером'
                return {'statusCode': 409, 'headers': CORS, 'body': json.dumps({'error': f'Клиент обрабатывается: {name}'}, ensure_ascii=False)}

            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

        # POST ?action=unlock
        if method == 'POST' and client_id and action == 'unlock':
            body = json.loads(event.get('body') or '{}')
            user_id = body.get('user_id')
            cur.execute(
                "UPDATE clients SET locked_by = NULL, locked_at = NULL WHERE id = %s AND locked_by = %s",
                (client_id, user_id)
            )
            conn.commit()
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

        # PATCH /{id} — сохранить результат и снять блокировку
        if method == 'PATCH' and client_id:
            body = json.loads(event.get('body') or '{}')
            fields = []
            values = []

            if 'result' in body:
                fields.append("result = %s")
                values.append(body['result'])
                fields.append("status = %s")
                values.append('done' if body['result'] else 'pending')
                fields.append("is_excluded = %s")
                values.append(body['result'] in ('3', '4'))

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
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Нет полей'}, ensure_ascii=False)}

            fields.extend(["locked_by = NULL", "locked_at = NULL", "updated_at = NOW()"])
            values.append(client_id)

            cur.execute(
                f"UPDATE clients SET {', '.join(fields)} WHERE id = %s RETURNING id, status, result, is_excluded",
                values
            )
            updated = cur.fetchone()
            conn.commit()

            if not updated:
                return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Клиент не найден'}, ensure_ascii=False)}

            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({
                'ok': True,
                'id': str(updated['id']),
                'status': updated['status'],
                'result': updated['result'],
                'isExcluded': updated['is_excluded'],
            }, ensure_ascii=False)}

        return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'}, ensure_ascii=False)}

    finally:
        conn.close()

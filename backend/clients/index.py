"""
Управление клиентами: получение списка, обновление результата обработки.
GET / — список клиентов (фильтр по master_id, status)
PATCH /{id} — обновить результат обработки
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


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    parts = [p for p in path.strip('/').split('/') if p]
    client_id = parts[-1] if len(parts) >= 1 and parts[-1].isdigit() else None

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # GET — список клиентов
        if method == 'GET':
            params = event.get('queryStringParameters') or {}
            master_id = params.get('master_id')
            status = params.get('status')
            include_excluded = params.get('include_excluded', 'false') == 'true'

            conditions = []
            values = []

            if not include_excluded:
                conditions.append("c.is_excluded = FALSE")

            if master_id:
                conditions.append("c.master_id = %s")
                values.append(master_id)

            if status:
                conditions.append("c.status = %s")
                values.append(status)

            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

            cur.execute(
                f"""
                SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                       c.order_number, c.master_id, c.status, c.result, c.result_note,
                       c.callback_date, c.is_excluded, c.report_id, c.updated_at
                FROM clients c
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
                })
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': clients}, ensure_ascii=False)}

        # PATCH /{id} — обновить результат
        if method == 'PATCH' and client_id:
            body = json.loads(event.get('body') or '{}')

            fields = []
            values = []

            if 'result' in body:
                fields.append("result = %s")
                values.append(body['result'])
                # Авто-статус
                fields.append("status = %s")
                values.append('done' if body['result'] else 'pending')
                # Авто-исключение для пунктов 3, 4
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
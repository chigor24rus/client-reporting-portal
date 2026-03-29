"""
Управление клиентами.
GET / — список клиентов, сгруппированных по телефону, с предстоящими работами
PATCH /?id= — обновить результат по конкретной записи
"""
import json
import os
from datetime import date, timedelta
import psycopg2
import psycopg2.extras

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
}

# Интервалы: (min_months, max_months) — окно фильтрации
WORK_INTERVALS = {
    'Масло и масляный фильтр двигателя - замена': (11, 24),
    'Жидкость тормозная - замена с прокачкой системы': (23, 36),
    'Масло АКПП - замена частичная': (23, 36),
    'Жидкость охлаждающая ДВС и HV- замена (100% аппаратная)': (35, 48),
}

UPCOMING_MONTHS = 3  # показываем предстоящие работы за N месяцев до порога


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def months_diff(d1: date, d2: date) -> float:
    """Разница в месяцах между двумя датами."""
    return (d2 - d1).days / 30.44


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    qs = event.get('queryStringParameters') or {}
    client_id = qs.get('id')

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # GET — список клиентов
        if method == 'GET':
            user_id = qs.get('user_id')
            include_all = qs.get('include_all', 'false') == 'true'

            if include_all:
                cur.execute("""
                    SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                           c.order_number, c.master_id, c.status, c.result, c.result_note,
                           c.callback_date, c.is_excluded
                    FROM clients c
                    WHERE c.is_excluded = FALSE
                    ORDER BY c.work_date DESC
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
                    })
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': clients}, ensure_ascii=False)}

            # Для мастера — выбираем все записи по всем типам работ для анализа
            # Берём последнюю запись по каждому (phone, work, vin)
            today = date.today()

            # Строим условие по всем работам: попадают в окно ИЛИ предстоят в ближайшие 3 мес
            work_conditions = []
            for work, (min_m, max_m) in WORK_INTERVALS.items():
                w = work.replace("'", "''")
                # Минимальный возраст для предстоящих: min_m - UPCOMING_MONTHS
                upcoming_min = max(0, min_m - UPCOMING_MONTHS)
                work_conditions.append(f"""
                    (c.work = '{w}'
                     AND c.work_date < NOW() - INTERVAL '{upcoming_min} months'
                     AND c.work_date >= NOW() - INTERVAL '{max_m} months')
                """)

            work_filter = " OR ".join(work_conditions)

            cur.execute(f"""
                SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                       c.order_number, c.status, c.result, c.result_note, c.callback_date,
                       ROW_NUMBER() OVER (PARTITION BY c.phone, c.work, c.vin ORDER BY c.work_date DESC) AS rn
                FROM clients c
                WHERE c.is_excluded = FALSE
                  AND c.status != 'done'
                  AND ({work_filter})
            """)
            all_rows = cur.fetchall()

            # Оставляем только последние записи (rn=1) по каждому (phone, work, vin)
            latest = [r for r in all_rows if r['rn'] == 1]

            # Группируем по телефону
            groups: dict = {}
            for r in latest:
                phone = r['phone'] or r['name']  # fallback на имя для юрлиц
                if phone not in groups:
                    groups[phone] = {
                        'phone': r['phone'],
                        'name': r['name'],
                        'works': [],
                        'min_urgency': float('inf'),
                    }

                work = r['work']
                min_m, max_m = WORK_INTERVALS.get(work, (0, 0))
                work_date = r['work_date']
                age_months = months_diff(work_date, today)

                # Определяем: активная (в окне) или предстоящая
                is_active = age_months >= min_m
                is_upcoming = not is_active  # значит age_months < min_m но >= min_m - 3

                # Срочность: разница между плановой датой след. замены и сегодня (в секундах)
                next_service = work_date + timedelta(days=min_m * 30.44)
                urgency_seconds = abs((today - next_service).total_seconds())

                groups[phone]['works'].append({
                    'id': str(r['id']),
                    'vin': r['vin'],
                    'work': work,
                    'workDate': work_date.strftime('%Y-%m-%d'),
                    'mileage': r['mileage'],
                    'orderNumber': r['order_number'],
                    'status': r['status'],
                    'result': r['result'],
                    'resultNote': r['result_note'],
                    'callbackDate': r['callback_date'].strftime('%Y-%m-%d') if r['callback_date'] else None,
                    'isUpcoming': is_upcoming,
                    'urgencySeconds': urgency_seconds,
                    'ageMonths': round(age_months, 1),
                    'nextServiceDate': next_service.strftime('%Y-%m-%d'),
                })

                # Срочность карточки = минимум среди активных работ
                if is_active:
                    groups[phone]['min_urgency'] = min(groups[phone]['min_urgency'], urgency_seconds)

            # Сортируем карточки по срочности (предстоящие-only карточки — в конец)
            sorted_groups = sorted(
                groups.values(),
                key=lambda g: g['min_urgency']
            )

            # Формируем ответ
            result = []
            for g in sorted_groups:
                # Сортируем работы внутри карточки: активные по срочности, предстоящие — в конец
                works_sorted = sorted(
                    g['works'],
                    key=lambda w: (w['isUpcoming'], w['urgencySeconds'])
                )
                # Общий статус карточки: если все работы pending — pending
                statuses = [w['status'] for w in works_sorted if not w['isUpcoming']]
                card_status = 'pending' if not statuses or any(s == 'pending' for s in statuses) else 'done'

                result.append({
                    'phone': g['phone'],
                    'name': g['name'],
                    'works': works_sorted,
                    'status': card_status,
                })

            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': result}, ensure_ascii=False)}

        # PATCH ?id= — сохранить результат
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

            if not fields:
                return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Нет полей'}, ensure_ascii=False)}

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

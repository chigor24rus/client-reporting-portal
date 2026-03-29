"""
Управление клиентами.
GET / — список клиентов для мастера: работы в окне + именинники (±7 дней, total_spent > 10000)
GET /?include_all=true — плоский список для админа
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

# Интервалы: (min_months, max_months)
WORK_INTERVALS = {
    'Масло и масляный фильтр двигателя - замена': (11, 24),
    'Жидкость тормозная - замена с прокачкой системы': (23, 36),
    'Масло АКПП - замена частичная': (23, 36),
    'Жидкость охлаждающая ДВС и HV- замена (100% аппаратная)': (35, 48),
}

UPCOMING_MONTHS = 3
BIRTHDAY_DAYS = 7        # окно ±7 дней
BIRTHDAY_MIN_SPENT = 10000  # минимальная сумма для именинника


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def months_diff(d1: date, d2: date) -> float:
    return (d2 - d1).days / 30.44


def is_birthday_near(birth_date: date, today: date, days: int = BIRTHDAY_DAYS) -> bool:
    """Проверяет, попадает ли день рождения в окно ±days от сегодня (без учёта года)."""
    if not birth_date:
        return False
    try:
        bday_this_year = birth_date.replace(year=today.year)
    except ValueError:
        # 29 февраля в невисокосный год
        bday_this_year = birth_date.replace(year=today.year, day=28)
    delta = abs((bday_this_year - today).days)
    # Также проверяем переход через конец года
    bday_next_year = bday_this_year.replace(year=today.year + 1)
    delta_next = abs((bday_next_year - today).days)
    bday_prev_year = bday_this_year.replace(year=today.year - 1)
    delta_prev = abs((bday_prev_year - today).days)
    return min(delta, delta_next, delta_prev) <= days


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    qs = event.get('queryStringParameters') or {}
    client_id = qs.get('id')

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # ─── GET ────────────────────────────────────────────────────────────
        if method == 'GET':
            user_id = qs.get('user_id')
            include_all = qs.get('include_all', 'false') == 'true'

            if include_all:
                cur.execute("""
                    SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                           c.order_number, c.master_id, c.status, c.result, c.result_note,
                           c.callback_date, c.is_excluded, c.birth_date, c.total_spent
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
                        'birthDate': r['birth_date'].strftime('%Y-%m-%d') if r['birth_date'] else None,
                        'totalSpent': float(r['total_spent']) if r['total_spent'] else None,
                    })
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': clients}, ensure_ascii=False)}

            # ─── Мастер: работы + именинники ────────────────────────────────
            today = date.today()

            # 1. Клиенты с предстоящими/просроченными работами
            work_conditions = []
            for work, (min_m, max_m) in WORK_INTERVALS.items():
                w = work.replace("'", "''")
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
                       c.birth_date, c.total_spent,
                       ROW_NUMBER() OVER (PARTITION BY c.phone, c.work, c.vin ORDER BY c.work_date DESC) AS rn
                FROM clients c
                WHERE c.is_excluded = FALSE
                  AND c.status != 'done'
                  AND (c.result != '5' OR c.callback_date IS NULL OR c.callback_date <= CURRENT_DATE)
                  AND ({work_filter})
            """)
            all_rows = cur.fetchall()
            work_rows = [r for r in all_rows if r['rn'] == 1]

            # 2. Именинники: birth_date ±7 дней, total_spent > 10000, нет незакрытых работ в выборке выше
            #    Берём уникальных клиентов по телефону из таблицы
            birthday_from = today - timedelta(days=BIRTHDAY_DAYS)
            birthday_to = today + timedelta(days=BIRTHDAY_DAYS)

            cur.execute("""
                SELECT DISTINCT ON (phone) id, name, phone, birth_date, total_spent, status, result, result_note, callback_date
                FROM clients
                WHERE is_excluded = FALSE
                  AND birth_date IS NOT NULL
                  AND total_spent > %s
                  AND (
                      (EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
                       AND ABS(EXTRACT(DAY FROM birth_date) - EXTRACT(DAY FROM CURRENT_DATE)) <= %s)
                    OR
                      (birth_date + (DATE_TRUNC('year', CURRENT_DATE) - DATE_TRUNC('year', birth_date))
                       BETWEEN CURRENT_DATE - INTERVAL '%s days' AND CURRENT_DATE + INTERVAL '%s days')
                  )
                ORDER BY phone, id
            """, (BIRTHDAY_MIN_SPENT, BIRTHDAY_DAYS, BIRTHDAY_DAYS, BIRTHDAY_DAYS))
            birthday_rows = cur.fetchall()

            # 3. Отложенные: result='5', callback_date > today — скрыты из основного списка,
            #    но должны отображаться в «Ожидают» с датой созвона
            cur.execute(f"""
                SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                       c.order_number, c.status, c.result, c.result_note, c.callback_date,
                       c.birth_date, c.total_spent,
                       ROW_NUMBER() OVER (PARTITION BY c.phone, c.work, c.vin ORDER BY c.work_date DESC) AS rn
                FROM clients c
                WHERE c.is_excluded = FALSE
                  AND c.status != 'done'
                  AND c.result = '5'
                  AND c.callback_date > CURRENT_DATE
                  AND ({work_filter})
            """)
            deferred_rows = [r for r in cur.fetchall() if r['rn'] == 1]

            # Телефоны клиентов у которых есть работы
            work_phones = {r['phone'] for r in work_rows if r['phone']}

            # Группируем клиентов с работами по телефону
            groups: dict = {}
            for r in work_rows:
                phone = r['phone'] or r['name']
                if phone not in groups:
                    groups[phone] = {
                        'phone': r['phone'],
                        'name': r['name'],
                        'works': [],
                        'min_urgency': float('inf'),
                        'birth_date': r['birth_date'],
                        'total_spent': float(r['total_spent']) if r['total_spent'] else None,
                        'is_birthday': False,
                    }

                work = r['work']
                min_m, max_m = WORK_INTERVALS.get(work, (0, 0))
                work_date = r['work_date']
                age_months = months_diff(work_date, today)
                is_active = age_months >= min_m
                is_upcoming = not is_active
                next_service = work_date + timedelta(days=int(min_m * 30.44))
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
                if is_active:
                    groups[phone]['min_urgency'] = min(groups[phone]['min_urgency'], urgency_seconds)

            # Помечаем именинников среди клиентов с работами
            for r in birthday_rows:
                phone = r['phone']
                if phone and is_birthday_near(r['birth_date'], today):
                    if phone in groups:
                        groups[phone]['is_birthday'] = True
                    else:
                        # Именинник без работ — добавляем отдельную карточку
                        groups[phone] = {
                            'phone': r['phone'],
                            'name': r['name'],
                            'works': [],
                            'min_urgency': float('inf'),
                            'birth_date': r['birth_date'],
                            'total_spent': float(r['total_spent']) if r['total_spent'] else None,
                            'is_birthday': True,
                        }

            # Добавляем отложенных клиентов — отдельные карточки с isDeferred=True
            deferred_phones = {r['phone'] for r in deferred_rows if r['phone']}
            for r in deferred_rows:
                phone = r['phone'] or r['name']
                if phone in groups:
                    # Уже есть в основном списке (другая работа не отложена) — не дублируем
                    continue
                if phone not in groups:
                    work = r['work']
                    min_m, max_m = WORK_INTERVALS.get(work, (0, 0))
                    work_date = r['work_date']
                    age_months = months_diff(work_date, today)
                    is_active = age_months >= min_m
                    next_service = work_date + timedelta(days=int(min_m * 30.44))
                    urgency_seconds = abs((today - next_service).total_seconds())
                    if phone not in groups:
                        groups[phone] = {
                            'phone': r['phone'],
                            'name': r['name'],
                            'works': [],
                            'min_urgency': float('inf'),
                            'birth_date': r['birth_date'],
                            'total_spent': float(r['total_spent']) if r['total_spent'] else None,
                            'is_birthday': False,
                            'is_deferred': True,
                            'callback_date': r['callback_date'],
                        }
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
                        'isUpcoming': not is_active,
                        'urgencySeconds': urgency_seconds,
                        'ageMonths': round(age_months, 1),
                        'nextServiceDate': next_service.strftime('%Y-%m-%d'),
                    })

            # Проставляем is_deferred = False тем, у кого нет флага
            for g in groups.values():
                g.setdefault('is_deferred', False)
                g.setdefault('callback_date', None)

            # Сортируем: сначала с работами по срочности, потом только именинники
            sorted_groups = sorted(
                groups.values(),
                key=lambda g: (
                    1 if not g['works'] else 0,  # именинники без работ — в конец
                    g['min_urgency']
                )
            )

            result = []
            for g in sorted_groups:
                works_sorted = sorted(
                    g['works'],
                    key=lambda w: (w['isUpcoming'], w['urgencySeconds'])
                )
                statuses = [w['status'] for w in works_sorted if not w['isUpcoming']]
                card_status = 'pending' if not statuses or any(s == 'pending' for s in statuses) else 'done'

                result.append({
                    'phone': g['phone'],
                    'name': g['name'],
                    'works': works_sorted,
                    'status': card_status,
                    'birthDate': g['birth_date'].strftime('%Y-%m-%d') if g['birth_date'] else None,
                    'totalSpent': g['total_spent'],
                    'isBirthday': g['is_birthday'],
                    'isDeferred': g['is_deferred'],
                    'cardCallbackDate': g['callback_date'].strftime('%Y-%m-%d') if g['callback_date'] else None,
                })

            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': result}, ensure_ascii=False)}

        # ─── PATCH ?id= ─────────────────────────────────────────────────────
        if method == 'PATCH' and client_id:
            body = json.loads(event.get('body') or '{}')
            fields = []
            values = []

            if 'result' in body:
                r_val = body['result']
                # '7' — нет ответа, '5' — повторный созвон: остаются pending
                PENDING_RESULTS = {'7', '5'}
                fields.append("result = %s")
                values.append(r_val)
                fields.append("status = %s")
                values.append('pending' if not r_val or r_val in PENDING_RESULTS else 'done')
                fields.append("is_excluded = %s")
                values.append(r_val in ('3', '4', '8'))

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
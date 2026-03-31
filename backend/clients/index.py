"""
Управление клиентами.
GET / — список клиентов для мастера: работы в окне + именинники (±7 дней, total_spent > 10000)
GET /?include_all=true — плоский список для админа
PATCH /?id= — обновить результат, фиксирует master_id = locked_by
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

    LOCK_TIMEOUT_MINUTES = 2

    try:
        # Сбрасываем устаревшие блокировки (старше LOCK_TIMEOUT_MINUTES минут)
        cur.execute(
            "UPDATE clients SET locked_by = NULL, locked_at = NULL WHERE locked_at < NOW() - INTERVAL '%s minutes'",
            (LOCK_TIMEOUT_MINUTES,)
        )
        conn.commit()

        # ─── GET ────────────────────────────────────────────────────────────
        if method == 'GET':
            user_id = qs.get('user_id')
            include_all = qs.get('include_all', 'false') == 'true'
            search_query = qs.get('search', '').strip()

            # Определяем: текущий пользователь тестовый?
            caller_is_test = False
            if user_id:
                cur.execute("SELECT is_test FROM users WHERE id = %s", (user_id,))
                u_row = cur.fetchone()
                if u_row:
                    caller_is_test = bool(u_row['is_test'])
            # Админы (include_all) и тестовые мастера видят тестовые записи
            hide_test = not (include_all or caller_is_test)
            test_filter = "AND c.is_test = FALSE" if hide_test else ""
            test_filter_no_alias = "AND is_test = FALSE" if hide_test else ""

            # ─── Активность мастеров по дням за месяц ───────────────────────
            if qs.get('daily_stats') == 'true':
                # month=YYYY-MM, по умолчанию текущий месяц
                month_param = qs.get('month', '')
                try:
                    from datetime import datetime as dt
                    if month_param:
                        month_start = dt.strptime(month_param, '%Y-%m').date().replace(day=1)
                    else:
                        today_d = date.today()
                        month_start = today_d.replace(day=1)
                    # последний день месяца
                    if month_start.month == 12:
                        month_end = month_start.replace(year=month_start.year + 1, month=1, day=1)
                    else:
                        month_end = month_start.replace(month=month_start.month + 1, day=1)
                except ValueError:
                    today_d = date.today()
                    month_start = today_d.replace(day=1)
                    month_end = month_start.replace(month=month_start.month + 1, day=1) if month_start.month < 12 else month_start.replace(year=month_start.year + 1, month=1, day=1)
                cur.execute("""
                    SELECT DATE(c.updated_at) AS day,
                           u.id AS user_id,
                           u.name,
                           COUNT(*) AS contacted,
                           COUNT(*) FILTER (WHERE c.result IN ('1','2_oil','2_brake','2_gearbox','2_coolant','gift_ok')) AS booked
                    FROM clients c
                    JOIN masters m ON m.id = c.master_id
                    JOIN users u ON u.id = m.user_id
                    WHERE c.result IS NOT NULL
                      AND c.is_excluded = FALSE
                      AND c.is_test = FALSE
                      AND u.active = TRUE
                      AND u.is_test = FALSE
                      AND DATE(c.updated_at) >= %s
                      AND DATE(c.updated_at) < %s
                    GROUP BY DATE(c.updated_at), u.id, u.name
                    ORDER BY day ASC, u.name
                """, (month_start, month_end))
                rows = cur.fetchall()
                result = []
                for r in rows:
                    result.append({
                        'day': r['day'].strftime('%Y-%m-%d'),
                        'userId': str(r['user_id']),
                        'name': ' '.join(r['name'].split()[:2]),
                        'contacted': r['contacted'],
                        'booked': r['booked'],
                    })
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'stats': result, 'month': month_start.strftime('%Y-%m')}, ensure_ascii=False)}

            # ─── Количество актуальных ожидающих клиентов (для страницы статистики админа) ───────────────
            if qs.get('pending_count') == 'true':
                wc_no_alias = []
                for work, (min_m, max_m) in WORK_INTERVALS.items():
                    w = work.replace("'", "''")
                    upcoming_min = max(0, min_m - UPCOMING_MONTHS)
                    wc_no_alias.append(f"""
                        (work = '{w}'
                         AND work_date < NOW() - INTERVAL '{upcoming_min} months'
                         AND work_date >= NOW() - INTERVAL '{max_m} months')
                    """)
                wf_no_alias = " OR ".join(wc_no_alias)
                wc_alias = []
                for work, (min_m, max_m) in WORK_INTERVALS.items():
                    w = work.replace("'", "''")
                    upcoming_min = max(0, min_m - UPCOMING_MONTHS)
                    wc_alias.append(f"""
                        (c.work = '{w}'
                         AND c.work_date < NOW() - INTERVAL '{upcoming_min} months'
                         AND c.work_date >= NOW() - INTERVAL '{max_m} months')
                    """)
                wf_alias = " OR ".join(wc_alias)
                cur.execute(f"""
                    WITH latest AS (
                        SELECT phone, work, vin, MAX(work_date) AS max_work_date
                        FROM clients
                        WHERE is_excluded = FALSE AND is_test = FALSE AND ({wf_no_alias})
                        GROUP BY phone, work, vin
                    )
                    SELECT COUNT(DISTINCT c.phone || '|' || c.work || '|' || c.vin) AS cnt
                    FROM clients c
                    JOIN latest l ON l.phone = c.phone AND l.work = c.work AND l.vin = c.vin
                                      AND c.work_date = l.max_work_date
                    WHERE c.is_excluded = FALSE AND c.is_test = FALSE
                      AND c.status != 'done'
                      AND (c.result != '5' OR c.callback_date IS NULL OR c.callback_date <= CURRENT_DATE)
                      AND ({wf_alias})
                """)
                row = cur.fetchone()
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'pending': int(row['cnt'] or 0)}, ensure_ascii=False)}

            # ─── Статистика мастеров (для виджета на дашборде) ──────────────
            if qs.get('masters_stats') == 'true':
                cur.execute("""
                    SELECT u.id as user_id, u.name,
                           COUNT(c.id) FILTER (WHERE c.result IS NOT NULL) as total,
                           COUNT(c.id) FILTER (WHERE c.result IN ('1','2_oil','2_brake','2_gearbox','2_coolant','gift_ok')) as done,
                           COUNT(c.id) as contacted
                    FROM users u
                    JOIN masters m ON m.user_id = u.id
                    LEFT JOIN clients c ON c.master_id = m.id AND c.is_excluded = FALSE
                    WHERE u.role = 'master' AND u.active = TRUE AND u.is_test = FALSE
                    GROUP BY u.id, u.name
                    ORDER BY done DESC, total DESC
                """)
                rows = cur.fetchall()
                stats = []
                for r in rows:
                    total = r['total'] or 0
                    done = r['done'] or 0
                    contacted = r['contacted'] or 0
                    stats.append({
                        'userId': str(r['user_id']),
                        'name': ' '.join(r['name'].split()[:2]),
                        'total': total,
                        'done': done,
                        'contacted': contacted,
                        'rate': round((done / total * 100)) if total else 0,
                    })
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'stats': stats}, ensure_ascii=False)}

            # ─── Поиск по всей базе (для мастера) ───────────────────────────
            if search_query and len(search_query) >= 2:
                q = f'%{search_query.lower()}%'
                cur.execute("""
                    SELECT DISTINCT ON (c.phone, c.vin, c.work)
                           c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                           c.order_number, c.status, c.result, c.result_note, c.callback_date,
                           c.birth_date, c.total_spent, c.locked_by, c.locked_at,
                           u.name AS locked_by_name
                    FROM clients c
                    LEFT JOIN users u ON u.id = c.locked_by
                    WHERE c.is_excluded = FALSE
                      AND c.vin != 'NO_VIN'
                      {test_filter}
                      AND (
                          LOWER(c.name) LIKE %s
                          OR LOWER(c.phone) LIKE %s
                          OR LOWER(c.vin) LIKE %s
                      )
                    ORDER BY c.phone, c.vin, c.work, c.work_date DESC
                """, (q, q, q))
                rows = cur.fetchall()

                today = date.today()
                groups: dict = {}
                for r in rows:
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
                            'is_deferred': False,
                            'callback_date': None,
                            'locked_by': str(r['locked_by']) if r['locked_by'] else None,
                            'locked_at': r['locked_at'].isoformat() if r['locked_at'] else None,
                            'locked_by_name': r['locked_by_name'] if r['locked_by_name'] else None,
                        }
                    work = r['work']
                    min_m, max_m = WORK_INTERVALS.get(work, (0, 0))
                    work_date = r['work_date']
                    age_months = months_diff(work_date, today) if work_date else 0
                    is_upcoming = min_m > 0 and age_months < (min_m - UPCOMING_MONTHS)
                    next_service = work_date + timedelta(days=int(min_m * 30.44)) if work_date and min_m else work_date
                    urgency_seconds = abs((today - next_service).total_seconds()) if next_service else 0
                    groups[phone]['works'].append({
                        'id': str(r['id']),
                        'vin': r['vin'],
                        'work': work,
                        'workDate': work_date.strftime('%Y-%m-%d') if work_date else None,
                        'mileage': r['mileage'],
                        'orderNumber': r['order_number'],
                        'status': r['status'],
                        'result': r['result'],
                        'resultNote': r['result_note'],
                        'callbackDate': r['callback_date'].strftime('%Y-%m-%d') if r['callback_date'] else None,
                        'isUpcoming': is_upcoming,
                        'urgencySeconds': urgency_seconds,
                        'ageMonths': round(age_months, 1),
                        'nextServiceDate': next_service.strftime('%Y-%m-%d') if next_service else None,
                    })
                    if not is_upcoming:
                        groups[phone]['min_urgency'] = min(groups[phone]['min_urgency'], urgency_seconds)

                result = []
                for g in sorted(groups.values(), key=lambda g: g['min_urgency']):
                    works_sorted = sorted(g['works'], key=lambda w: (w['isUpcoming'], w['urgencySeconds']))
                    statuses = [w['status'] for w in works_sorted if not w['isUpcoming']]
                    card_status = 'pending' if not statuses or any(s == 'pending' for s in statuses) else 'done'
                    result.append({
                        'phone': g['phone'],
                        'name': g['name'],
                        'works': works_sorted,
                        'status': card_status,
                        'birthDate': g['birth_date'].strftime('%Y-%m-%d') if g['birth_date'] else None,
                        'totalSpent': g['total_spent'],
                        'isBirthday': False,
                        'isDeferred': False,
                        'cardCallbackDate': None,
                        'lockedBy': g['locked_by'],
                        'lockedAt': g['locked_at'],
                        'lockedByName': g['locked_by_name'],
                    })
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': result}, ensure_ascii=False)}

            if include_all:
                cur.execute("""
                    SELECT DISTINCT ON (c.phone, c.vin, c.work)
                           c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                           c.order_number, c.master_id, c.status, c.result, c.result_note,
                           c.callback_date, c.is_excluded, c.birth_date, c.total_spent, c.is_test
                    FROM clients c
                    WHERE c.is_test = FALSE
                    ORDER BY c.phone, c.vin, c.work, c.work_date DESC
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
                        'isTest': bool(r['is_test']),
                    })
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': clients}, ensure_ascii=False)}

            # ─── Мастер: работы + именинники ────────────────────────────────
            today = date.today()

            # 1. Клиенты с предстоящими/просроченными работами
            work_conditions = []
            work_conditions_no_alias = []
            max_date_conditions = []
            for work, (min_m, max_m) in WORK_INTERVALS.items():
                w = work.replace("'", "''")
                upcoming_min = max(0, min_m - UPCOMING_MONTHS)
                work_conditions.append(f"""
                    (c.work = '{w}'
                     AND c.work_date < NOW() - INTERVAL '{upcoming_min} months'
                     AND c.work_date >= NOW() - INTERVAL '{max_m} months')
                """)
                work_conditions_no_alias.append(f"""
                    (work = '{w}'
                     AND work_date < NOW() - INTERVAL '{upcoming_min} months'
                     AND work_date >= NOW() - INTERVAL '{max_m} months')
                """)
                max_date_conditions.append(f"work = '{w}'")
            work_filter = " OR ".join(work_conditions)
            work_filter_no_alias = " OR ".join(work_conditions_no_alias)

            cur.execute(f"""
                WITH latest AS (
                    SELECT phone, work, vin, MAX(work_date) AS max_work_date
                    FROM clients
                    WHERE is_excluded = FALSE {test_filter_no_alias} AND ({work_filter_no_alias})
                    GROUP BY phone, work, vin
                )
                SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                       c.order_number, c.status, c.result, c.result_note, c.callback_date,
                       c.birth_date, c.total_spent, c.locked_by, c.locked_at,
                       u.name AS locked_by_name,
                       1 AS rn
                FROM clients c
                LEFT JOIN users u ON u.id = c.locked_by
                JOIN latest l ON l.phone = c.phone AND l.work = c.work AND l.vin = c.vin
                                  AND c.work_date = l.max_work_date
                WHERE c.is_excluded = FALSE
                  {test_filter}
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

            cur.execute(f"""
                SELECT DISTINCT ON (phone) id, name, phone, birth_date, total_spent, status, result, result_note, callback_date
                FROM clients
                WHERE is_excluded = FALSE
                  {test_filter_no_alias}
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
                WITH latest AS (
                    SELECT phone, work, vin, MAX(work_date) AS max_work_date
                    FROM clients
                    WHERE is_excluded = FALSE {test_filter_no_alias} AND ({work_filter_no_alias})
                    GROUP BY phone, work, vin
                )
                SELECT c.id, c.name, c.phone, c.vin, c.work, c.work_date, c.mileage,
                       c.order_number, c.status, c.result, c.result_note, c.callback_date,
                       c.birth_date, c.total_spent, c.locked_by, c.locked_at,
                       u.name AS locked_by_name,
                       1 AS rn
                FROM clients c
                LEFT JOIN users u ON u.id = c.locked_by
                JOIN latest l ON l.phone = c.phone AND l.work = c.work AND l.vin = c.vin
                                  AND c.work_date = l.max_work_date
                WHERE c.is_excluded = FALSE
                  {test_filter}
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
                        'locked_by': str(r['locked_by']) if r['locked_by'] else None,
                        'locked_at': r['locked_at'].isoformat() if r['locked_at'] else None,
                        'locked_by_name': r['locked_by_name'] if r['locked_by_name'] else None,
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
                        groups[phone]['birth_date'] = r['birth_date']
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
                g.setdefault('locked_by', None)
                g.setdefault('locked_at', None)
                g.setdefault('locked_by_name', None)

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
                    'lockedBy': g['locked_by'],
                    'lockedAt': g['locked_at'],
                    'lockedByName': g['locked_by_name'],
                })

            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'clients': result}, ensure_ascii=False)}

        # ─── POST ?id=&action=lock|unlock ───────────────────────────────────
        if method == 'POST' and client_id:
            body = json.loads(event.get('body') or '{}')
            action = qs.get('action')
            user_id = body.get('user_id')

            if action == 'lock':
                # Проверяем, не заблокирована ли уже другим
                cur.execute(
                    "SELECT locked_by FROM clients WHERE id = %s",
                    (client_id,)
                )
                row = cur.fetchone()
                if not row:
                    return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Клиент не найден'}, ensure_ascii=False)}
                locked_by = row['locked_by']
                if locked_by and str(locked_by) != str(user_id):
                    return {'statusCode': 409, 'headers': CORS, 'body': json.dumps({'error': 'Карточка уже открыта другим мастером'}, ensure_ascii=False)}
                cur.execute(
                    "UPDATE clients SET locked_by = %s, locked_at = NOW() WHERE id = %s",
                    (user_id, client_id)
                )
                conn.commit()
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

            if action == 'unlock':
                cur.execute(
                    "UPDATE clients SET locked_by = NULL, locked_at = NULL WHERE id = %s AND (locked_by = %s OR locked_by IS NULL)",
                    (client_id, user_id)
                )
                conn.commit()
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

            if action == 'reset':
                cur.execute(
                    "UPDATE clients SET result = NULL, result_note = NULL, callback_date = NULL, status = 'pending', master_id = NULL, is_excluded = FALSE, locked_by = NULL, locked_at = NULL WHERE id = %s RETURNING id",
                    (client_id,)
                )
                if not cur.fetchone():
                    return {'statusCode': 404, 'headers': CORS, 'body': json.dumps({'error': 'Клиент не найден'}, ensure_ascii=False)}
                conn.commit()
                return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True}, ensure_ascii=False)}

            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Неизвестный action'}, ensure_ascii=False)}

        # ─── PATCH ?id= ─────────────────────────────────────────────────────
        if method == 'PATCH' and client_id:
            body = json.loads(event.get('body') or '{}')
            fields = []
            values = []

            if 'result' in body:
                r_val = body['result']
                PENDING_RESULTS = {'7', '5'}
                fields.append("result = %s")
                values.append(r_val)
                fields.append("status = %s")
                values.append('pending' if not r_val or r_val in PENDING_RESULTS else 'done')
                fields.append("is_excluded = %s")
                values.append(r_val in ('3', '4', '8'))
                # Фиксируем мастера, который сохранил результат
                if body.get('user_id'):
                    cur.execute("SELECT id FROM masters WHERE user_id = %s", (int(body['user_id']),))
                    master_row = cur.fetchone()
                    if master_row:
                        fields.append("master_id = %s")
                        values.append(master_row['id'])

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
                f"UPDATE clients SET {', '.join(fields)} WHERE id = %s RETURNING id, status, result, is_excluded, phone",
                values
            )
            updated = cur.fetchone()

            # Если «Записан на выполнение всех работ» — закрываем все остальные работы клиента
            if updated and body.get('result') == '1':
                master_id_val = None
                if body.get('user_id'):
                    cur.execute("SELECT id FROM masters WHERE user_id = %s", (int(body['user_id']),))
                    mr = cur.fetchone()
                    if mr:
                        master_id_val = mr['id']
                cur.execute(
                    """UPDATE clients SET result = '1', status = 'done', is_excluded = FALSE,
                       master_id = COALESCE(%s, master_id), updated_at = NOW()
                       WHERE phone = %s AND id != %s AND status = 'pending' AND is_excluded = FALSE""",
                    (master_id_val, updated['phone'], client_id)
                )

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
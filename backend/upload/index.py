"""
Загрузка и парсинг текстовых отчётов из 1С.
Поддерживает два формата:
  1. «История по заказ-нарядам» — с VIN, номером заказа, пробегом
  2. «Сводный» — Ф.И.О., телефон, дата рождения, итоговая сумма
POST / — принимает base64-содержимое TXT-файла, определяет формат, парсит и сохраняет.
"""
import json
import os
import re
import base64
import traceback
import psycopg2
import psycopg2.extras
from datetime import datetime


CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
}

# Фиктивный VIN для клиентов без авто (из сводного файла)
NO_VIN = 'NO_VIN'


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def normalize_phone(raw: str) -> str:
    digits = re.sub(r'[^\d]', '', raw)
    if not digits:
        return ''
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    if not digits.startswith('7'):
        digits = '7' + digits
    return '+' + digits


def normalize_name(name: str) -> str:
    return ' '.join(name.strip().split()).lower()


def detect_format(text: str) -> str:
    if re.search(r'VIN:', text):
        return 'orders'
    if re.search(r'\+7', text):
        return 'summary'
    return 'orders'


def parse_orders_txt(text: str) -> list:
    """Парсит формат «История по заказ-нарядам» (с VIN).
    Один клиент может иметь несколько заказ-нарядов подряд — все читаются.
    """
    lines = [l.strip() for l in text.splitlines()]

    work_type = None
    for line in lines:
        m = re.search(r'Работа-Номенклатура Равно ""(.+?)""', line)
        if m:
            work_type = m.group(1).strip()
            break

    clients = []
    i = 0
    while i < len(lines):
        line = lines[i]
        phone_match = re.search(r'\+7[\s\(][\d\s\(\)\-]{9,}', line)
        if phone_match and ',' in line:
            parts = line.split(',', 1)
            name = parts[0].strip()
            phone = normalize_phone(parts[1].strip())

            vin = None
            if i + 1 < len(lines):
                vin_m = re.search(r'VIN:\s*([^;]+)', lines[i + 1])
                if vin_m:
                    vin = vin_m.group(1).strip()[:17]

            # Читаем все заказ-наряды этого клиента подряд (начиная с i+2)
            j = i + 2
            while j < len(lines):
                order_m = re.search(r'Заказ-наряд\s+(\S+)\s+от\s+(\d{2}\.\d{2}\.\d{4})', lines[j])
                if not order_m:
                    break

                order_number = order_m.group(1).strip()
                try:
                    work_date = datetime.strptime(order_m.group(2), '%d.%m.%Y').date()
                except ValueError:
                    j += 3
                    continue

                mileage = None
                if j + 2 < len(lines):
                    mileage_line = lines[j + 2].replace('\xa0', '').replace(' ', '')
                    if mileage_line.isdigit():
                        mileage = int(mileage_line)

                if vin and work_date and order_number:
                    clients.append({
                        'name': name,
                        'phone': phone,
                        'vin': vin,
                        'work': work_type or 'Неизвестно',
                        'work_date': work_date,
                        'mileage': mileage,
                        'order_number': order_number,
                    })

                j += 3  # Заказ-наряд, название работы, пробег

            i = j  # переходим к следующему клиенту
        else:
            i += 1

    return clients


def parse_summary_txt(text: str) -> list:
    """Парсит сводный формат: ФИО, телефон, дата рождения, итоговая сумма."""
    clients = []
    for line in text.splitlines():
        line = line.strip()
        if not line or '\t' not in line:
            continue

        tab_idx = line.rfind('\t')
        left = line[:tab_idx].strip()
        right = line[tab_idx + 1:].strip()

        amount_str = re.sub(r'[^\d,\.]', '', right).replace(',', '.')
        if not amount_str:
            continue
        try:
            total_spent = float(amount_str)
        except ValueError:
            continue

        if '+7' not in left:
            continue

        parts = [p.strip() for p in left.split(',')]
        if len(parts) < 2:
            continue

        name = parts[0].strip()
        phone = normalize_phone(parts[1].strip())

        birth_date = None
        if len(parts) >= 3 and parts[2]:
            try:
                birth_date = datetime.strptime(parts[2].strip(), '%d.%m.%Y').date()
            except ValueError:
                pass

        if name and phone:
            clients.append({
                'name': name,
                'phone': phone,
                'birth_date': birth_date,
                'total_spent': total_spent,
            })

    return clients


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'POST')
    if method != 'POST':
        return {'statusCode': 405, 'headers': CORS, 'body': json.dumps({'error': 'Method not allowed'})}

    try:
        raw_body = event.get('body') or '{}'
        body = raw_body if isinstance(raw_body, dict) else json.loads(raw_body)

        filename = body.get('filename', 'report.txt')
        content_b64 = body.get('content', '')

        if not content_b64:
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Файл не передан'}, ensure_ascii=False)}

        raw = base64.b64decode(content_b64)
        text = None
        for enc in ('utf-8-sig', 'cp1251', 'utf-8'):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue

        if not text:
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': 'Не удалось определить кодировку файла'}, ensure_ascii=False)}

        fmt = detect_format(text)
        conn = get_conn()
        cur = conn.cursor()

        # ─── СВОДНЫЙ ФОРМАТ ──────────────────────────────────────────────────
        if fmt == 'summary':
            records = parse_summary_txt(text)
            if not records:
                conn.close()
                return {'statusCode': 422, 'headers': CORS, 'body': json.dumps({'error': 'Не удалось распознать клиентов. Проверьте формат.'}, ensure_ascii=False)}

            phones = list({r['phone'] for r in records if r['phone']})

            # Совмещение по телефону
            cur.execute(
                "SELECT DISTINCT ON (phone) id, name, phone FROM clients WHERE phone = ANY(%s) ORDER BY phone, id",
                (phones,)
            )
            phone_map = {r[2]: r[0] for r in cur.fetchall()}

            # Совмещение по имени для тех, кто не нашёлся по телефону
            need_name_match = [r for r in records if not (r['phone'] and r['phone'] in phone_map)]
            name_map = {}
            if need_name_match:
                cur.execute(
                    "SELECT DISTINCT ON (lower(trim(name))) id, name FROM clients ORDER BY lower(trim(name)), id"
                )
                name_map = {normalize_name(r[1]): r[0] for r in cur.fetchall()}

            rows_by_phone: dict = {}  # phone -> (birth_date, total_spent)
            rows_by_id: list = []     # [(id, birth_date, total_spent)]
            to_insert_summary: list = []  # новые клиенты без совпадения

            matched = 0
            unmatched = 0
            added = 0

            for r in records:
                phone = r['phone']
                name_key = normalize_name(r['name'])

                if phone and phone in phone_map:
                    rows_by_phone[phone] = (r.get('birth_date'), r['total_spent'])
                    matched += 1
                elif name_key in name_map:
                    rows_by_id.append((name_map[name_key], r.get('birth_date'), r['total_spent']))
                    matched += 1
                else:
                    # Не нашли — добавляем как нового клиента (без VIN)
                    to_insert_summary.append(r)
                    unmatched += 1
                    added += 1

            # Батчевый UPDATE по телефону
            if rows_by_phone:
                values_sql = ', '.join(
                    cur.mogrify("(%s, %s, %s)", (ph, bd, ts)).decode()
                    for ph, (bd, ts) in rows_by_phone.items()
                )
                cur.execute(f"""
                    UPDATE clients SET
                        total_spent = v.total_spent::numeric,
                        birth_date = CASE WHEN v.birth_date IS NOT NULL THEN v.birth_date::date ELSE clients.birth_date END,
                        updated_at = NOW()
                    FROM (VALUES {values_sql}) AS v(phone, birth_date, total_spent)
                    WHERE clients.phone = v.phone
                """)

            # Батчевый UPDATE по id
            if rows_by_id:
                values_sql = ', '.join(
                    cur.mogrify("(%s, %s, %s)", (cid, bd, ts)).decode()
                    for cid, bd, ts in rows_by_id
                )
                cur.execute(f"""
                    UPDATE clients SET
                        total_spent = v.total_spent::numeric,
                        birth_date = CASE WHEN v.birth_date IS NOT NULL THEN v.birth_date::date ELSE clients.birth_date END,
                        updated_at = NOW()
                    FROM (VALUES {values_sql}) AS v(id, birth_date, total_spent)
                    WHERE clients.id = v.id::int
                """)

            # INSERT новых клиентов без VIN
            if to_insert_summary:
                psycopg2.extras.execute_values(
                    cur,
                    """INSERT INTO clients (name, phone, vin, work, work_date, mileage, order_number,
                                           birth_date, total_spent, status)
                       VALUES %s
                       ON CONFLICT DO NOTHING""",
                    [(
                        r['name'], r['phone'], NO_VIN, 'birthday_only',
                        datetime.today().date(), None, None,
                        r.get('birth_date'), r['total_spent'], 'pending'
                    ) for r in to_insert_summary]
                )

            conn.commit()
            conn.close()

            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({
                    'ok': True,
                    'format': 'summary',
                    'total': len(records),
                    'matched': matched,
                    'updated': matched,
                    'unmatched': unmatched,
                    'added': added,
                }, ensure_ascii=False)
            }

        # ─── ФОРМАТ ЗАКАЗ-НАРЯДОВ ────────────────────────────────────────────
        else:
            clients = parse_orders_txt(text)
            if not clients:
                conn.close()
                return {'statusCode': 422, 'headers': CORS, 'body': json.dumps({'error': 'Не удалось распознать клиентов. Проверьте формат.'}, ensure_ascii=False)}

            cur.execute(
                "INSERT INTO reports (filename, uploaded_by, clients_count) VALUES (%s, %s, %s) RETURNING id",
                (filename, None, len(clients))
            )
            report_id = cur.fetchone()[0]

            # Батчевый UPSERT: INSERT ... ON CONFLICT (vin, order_number) DO UPDATE
            # Это заменяет цикл с отдельными UPDATE/INSERT — в разы быстрее для больших файлов
            phones_in_file = list({c['phone'] for c in clients if c['phone']})
            cur.execute(
                "SELECT DISTINCT ON (phone) id, phone FROM clients WHERE phone = ANY(%s) AND vin = %s ORDER BY phone, id",
                (phones_in_file, NO_VIN)
            )
            novin_by_phone = {r[1]: r[0] for r in cur.fetchall()}

            cur.execute(
                "SELECT DISTINCT ON (lower(trim(name))) id, name FROM clients WHERE vin = %s ORDER BY lower(trim(name)), id",
                (NO_VIN,)
            )
            novin_by_name = {normalize_name(r[1]): r[0] for r in cur.fetchall()}

            # Клиентов-заглушек NO_VIN обновляем батчем
            to_update_novin = []
            to_upsert = []

            for c in clients:
                novin_id = novin_by_phone.get(c['phone']) or novin_by_name.get(normalize_name(c['name']))
                if novin_id:
                    to_update_novin.append((c['vin'], c['work'], c['work_date'], c['mileage'], c['order_number'], report_id, novin_id))
                else:
                    to_upsert.append((c['name'], c['phone'], c['vin'], c['work'], c['work_date'], c['mileage'], c['order_number'], report_id))

            if to_update_novin:
                psycopg2.extras.execute_values(
                    cur,
                    """UPDATE clients SET vin=v.vin, work=v.work, work_date=v.work_date,
                       mileage=v.mileage, order_number=v.order_number,
                       report_id=v.report_id, updated_at=NOW()
                       FROM (VALUES %s) AS v(vin, work, work_date, mileage, order_number, report_id, id)
                       WHERE clients.id = v.id""",
                    to_update_novin,
                    template="(%s, %s, %s::date, %s, %s, %s, %s)"
                )

            added = 0
            updated = 0
            if to_upsert:
                psycopg2.extras.execute_values(
                    cur,
                    """INSERT INTO clients (name, phone, vin, work, work_date, mileage, order_number, report_id, status)
                       VALUES %s
                       ON CONFLICT (vin, order_number) DO UPDATE SET
                           name = EXCLUDED.name,
                           phone = EXCLUDED.phone,
                           work = EXCLUDED.work,
                           work_date = EXCLUDED.work_date,
                           mileage = EXCLUDED.mileage,
                           report_id = EXCLUDED.report_id,
                           updated_at = NOW()""",
                    [r + ('pending',) for r in to_upsert]
                )
                added = len(to_upsert)
                updated = len(to_update_novin)

            conn.commit()
            conn.close()

            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({
                    'ok': True,
                    'format': 'orders',
                    'total': len(clients),
                    'added': added,
                    'updated': updated,
                    'matched': 0,
                    'unmatched': 0,
                    'report_id': report_id,
                }, ensure_ascii=False)
            }

    except Exception:
        err = traceback.format_exc()
        return {
            'statusCode': 500,
            'headers': CORS,
            'body': json.dumps({'error': err}, ensure_ascii=False)
        }
"""
Загрузка и парсинг текстовых отчётов из 1С.
Поддерживает два формата:
  1. «История по заказ-нарядам» — с VIN, номером заказа, пробегом
  2. «История по заказ-нарядам (сводная)» — Ф.И.О., телефон, дата рождения, итоговая сумма
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


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def normalize_phone(raw: str) -> str:
    """Нормализует телефон к формату +7XXXXXXXXXX."""
    digits = re.sub(r'[^\d]', '', raw)
    if not digits:
        return ''
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    if not digits.startswith('7'):
        digits = '7' + digits
    return '+' + digits


def normalize_name(name: str) -> str:
    """Нормализует имя: удаляет лишние пробелы, приводит к нижнему регистру для сравнения."""
    return ' '.join(name.strip().split()).lower()


def detect_format(text: str) -> str:
    """
    Определяет формат файла.
    'summary' — файл с Ф.И.О., телефоном, датой рождения, итоговой суммой.
    'orders'  — файл с заказ-нарядами (VIN, номер, пробег).
    """
    # В сводном формате данные идут строками вида: ФИО, телефон, дата\tСумма
    # Нет строк с VIN:
    if re.search(r'VIN:', text):
        return 'orders'
    # Есть строки с телефоном +7 и числом после табуляции — сводный формат
    if re.search(r'\+7.+\t[\d\s,\.]+$', text, re.MULTILINE):
        return 'summary'
    # По-умолчанию пробуем сводный, если есть строки с +7
    if re.search(r'\+7', text):
        return 'summary'
    return 'orders'


def parse_orders_txt(text: str) -> list:
    """
    Парсит формат «История по заказ-нарядам» (с VIN).
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
            phone_raw = parts[1].strip()
            phone = normalize_phone(phone_raw)

            vin = None
            if i + 1 < len(lines):
                vin_m = re.search(r'VIN:\s*([^;]+)', lines[i + 1])
                if vin_m:
                    vin = vin_m.group(1).strip()[:17]

            order_number = None
            work_date = None
            if i + 2 < len(lines):
                order_m = re.search(r'Заказ-наряд\s+(\S+)\s+от\s+(\d{2}\.\d{2}\.\d{4})', lines[i + 2])
                if order_m:
                    order_number = order_m.group(1).strip()
                    try:
                        work_date = datetime.strptime(order_m.group(2), '%d.%m.%Y').date()
                    except ValueError:
                        pass

            mileage = None
            if i + 4 < len(lines):
                mileage_line = lines[i + 4].replace('\xa0', '').replace(' ', '')
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
            i += 5
        else:
            i += 1

    return clients


def parse_summary_txt(text: str) -> list:
    """
    Парсит формат «История по заказ-нарядам (сводная)».
    Строки вида: Фамилия Имя Отчество, +7 (XXX) XXX-XX-XX, ДД.ММ.ГГГГ\tСумма
    или: Фамилия Имя Отчество, +7 (XXX) XXX-XX-XX,\tСумма (без даты рождения)
    """
    clients = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Разделяем на часть до таба и сумму после таба
        if '\t' not in line:
            continue
        tab_idx = line.rfind('\t')
        left = line[:tab_idx].strip()
        right = line[tab_idx + 1:].strip()

        # Парсим сумму (убираем пробелы и заменяем запятую на точку)
        amount_str = re.sub(r'[^\d,\.]', '', right).replace(',', '.')
        if not amount_str:
            continue
        try:
            total_spent = float(amount_str)
        except ValueError:
            continue

        # Строка должна содержать телефон +7
        if '+7' not in left:
            continue

        # Разбиваем по запятым: [ФИО, телефон, дата_рождения?]
        parts = [p.strip() for p in left.split(',')]
        if len(parts) < 2:
            continue

        name = parts[0].strip()
        phone_raw = parts[1].strip()
        phone = normalize_phone(phone_raw)

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
        if isinstance(raw_body, dict):
            body = raw_body
        else:
            body = json.loads(raw_body)

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

        if fmt == 'summary':
            # --- Формат: ФИО, телефон, дата рождения, итоговая сумма ---
            records = parse_summary_txt(text)
            if not records:
                conn.close()
                return {'statusCode': 422, 'headers': CORS, 'body': json.dumps({'error': 'Не удалось распознать клиентов в файле. Проверьте формат.'}, ensure_ascii=False)}

            phones = list({r['phone'] for r in records if r['phone']})

            # Загружаем уникальных клиентов по телефону
            cur.execute(
                "SELECT DISTINCT ON (phone) id, name, phone FROM clients WHERE phone = ANY(%s) ORDER BY phone, id",
                (phones,)
            )
            phone_map = {r[2]: r[0] for r in cur.fetchall()}

            # Загружаем уникальных клиентов по имени (только те, чьи телефоны не совпали)
            unmatched_names = [
                normalize_name(r['name']) for r in records
                if not (r['phone'] and r['phone'] in phone_map)
            ]
            name_map = {}
            if unmatched_names:
                cur.execute(
                    "SELECT DISTINCT ON (lower(trim(name))) id, name FROM clients ORDER BY lower(trim(name)), id"
                )
                name_map = {normalize_name(r[1]): r[0] for r in cur.fetchall()}

            # Строим таблицу совмещения: phone -> (client_id, birth_date, total_spent)
            # Одним UPDATE через VALUES + JOIN обновляем все записи батчом
            rows_by_phone: dict = {}   # phone -> (birth_date, total_spent)
            rows_by_id: list = []      # [(id, birth_date, total_spent)] для совпадений по имени без телефона

            matched = 0
            unmatched = 0

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
                    unmatched += 1

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

            # Батчевый UPDATE по id (найдены по имени)
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
                    'added': 0,
                }, ensure_ascii=False)
            }

        else:
            # --- Формат: заказ-наряды с VIN ---
            clients = parse_orders_txt(text)
            if not clients:
                conn.close()
                return {'statusCode': 422, 'headers': CORS, 'body': json.dumps({'error': 'Не удалось распознать клиентов в файле. Проверьте формат.'}, ensure_ascii=False)}

            cur.execute(
                "INSERT INTO reports (filename, uploaded_by, clients_count) VALUES (%s, %s, %s) RETURNING id",
                (filename, None, len(clients))
            )
            report_id = cur.fetchone()[0]

            vins = list({c['vin'] for c in clients})
            cur.execute(
                "SELECT id, vin, order_number FROM clients WHERE vin = ANY(%s)",
                (vins,)
            )
            existing_map = {(r[1], r[2]): r[0] for r in cur.fetchall()}

            added = 0
            updated = 0
            to_insert = []

            for c in clients:
                key = (c['vin'], c['order_number'])
                if key in existing_map:
                    cur.execute(
                        """UPDATE clients SET name=%s, phone=%s, work=%s, work_date=%s,
                           mileage=%s, report_id=%s, updated_at=NOW() WHERE id=%s""",
                        (c['name'], c['phone'], c['work'], c['work_date'],
                         c['mileage'], report_id, existing_map[key])
                    )
                    updated += 1
                else:
                    to_insert.append((
                        c['name'], c['phone'], c['vin'], c['work'],
                        c['work_date'], c['mileage'], c['order_number'], report_id
                    ))
                    added += 1

            if to_insert:
                psycopg2.extras.execute_values(
                    cur,
                    """INSERT INTO clients (name, phone, vin, work, work_date, mileage, order_number, report_id, status)
                       VALUES %s""",
                    [r + ('pending',) for r in to_insert]
                )

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
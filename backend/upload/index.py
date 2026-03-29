"""
Загрузка и парсинг текстового отчёта из 1С (История по заказ-нарядам).
POST / — принимает base64-содержимое TXT-файла, парсит и сохраняет клиентов в БД.
Логика: если клиент с таким VIN + order_number уже есть — обновляем, нет — добавляем.
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


def parse_txt(text: str) -> list:
    """
    Парсит текстовый отчёт 1С.
    Каждый клиент — блок из строк:
      ФИО, телефон
      VIN: ...; Модель; ...
      Заказ-наряд НОМЕР от ДАТА ВРЕМЯ
      Тип работы, ...
      Пробег (число)
    """
    lines = [l.strip() for l in text.splitlines()]

    # Ищем строку с типом работы из параметров отчёта
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

        # Строка клиента: содержит телефон +7 и запятую
        phone_match = re.search(r'\+7[\s\(][\d\s\(\)\-]{9,}', line)
        if phone_match and ',' in line:
            parts = line.split(',', 1)
            name = parts[0].strip()
            phone_raw = parts[1].strip()
            phone = re.sub(r'[^\d+]', '', phone_raw)
            if phone and not phone.startswith('+'):
                phone = '+' + phone

            vin = None
            if i + 1 < len(lines):
                vin_line = lines[i + 1]
                vin_m = re.search(r'VIN:\s*([^;]+)', vin_line)
                if vin_m:
                    vin = vin_m.group(1).strip()[:17]

            order_number = None
            work_date = None
            if i + 2 < len(lines):
                order_line = lines[i + 2]
                order_m = re.search(r'Заказ-наряд\s+(\S+)\s+от\s+(\d{2}\.\d{2}\.\d{4})', order_line)
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

        clients = parse_txt(text)
        if not clients:
            return {'statusCode': 422, 'headers': CORS, 'body': json.dumps({'error': 'Не удалось распознать клиентов в файле. Проверьте формат.'}, ensure_ascii=False)}

        conn = get_conn()
        cur = conn.cursor()

        cur.execute(
            "INSERT INTO reports (filename, uploaded_by, clients_count) VALUES (%s, %s, %s) RETURNING id",
            (filename, None, len(clients))
        )
        report_id = cur.fetchone()[0]

        # Получаем существующие записи через временную таблицу
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
                'total': len(clients),
                'added': added,
                'updated': updated,
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

"""
Загрузка и парсинг текстового отчёта из 1С (История по заказ-нарядам).
POST / — принимает base64-содержимое TXT-файла, парсит и сохраняет клиентов в БД.
Логика: если клиент с таким VIN + order_number уже есть — обновляем, нет — добавляем.
"""
import json
import os
import re
import base64
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


def parse_txt(text: str) -> list[dict]:
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

    # Ищем блоки клиентов — начинаются со строки "ФИО, телефон"
    # Паттерн: строка с +7 (или 8) — это начало блока
    clients = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # Строка клиента: содержит телефон +7 (XXX)
        phone_match = re.search(r'(\+7[\s\(][\d\s\(\)\-]{9,})', line)
        if phone_match and ',' in line:
            # Разбиваем на ФИО и телефон
            parts = line.split(',', 1)
            name = parts[0].strip()
            phone_raw = parts[1].strip()
            phone = re.sub(r'[^\d+]', '', phone_raw)
            if phone.startswith('7') and not phone.startswith('+'):
                phone = '+' + phone

            # Следующая строка — VIN и модель
            vin = None
            car_model = None
            if i + 1 < len(lines):
                vin_line = lines[i + 1]
                vin_m = re.search(r'VIN:\s*([^;]+)', vin_line)
                if vin_m:
                    vin = vin_m.group(1).strip()
                model_m = re.search(r'VIN:[^;]+;\s*([^;]+)', vin_line)
                if model_m:
                    car_model = model_m.group(1).strip()

            # Следующая строка — заказ-наряд
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

            # Строка с типом работы (i+3) — пропускаем, уже знаем из параметров
            # Строка с пробегом (i+4)
            mileage = None
            if i + 4 < len(lines):
                mileage_line = lines[i + 4]
                mileage_m = re.match(r'^[\d\s]+$', mileage_line.replace(' ', ''))
                if mileage_m or re.match(r'^[\d ]+$', mileage_line):
                    try:
                        mileage = int(mileage_line.replace(' ', '').replace('\xa0', ''))
                    except ValueError:
                        pass

            if vin and work_date and order_number:
                clients.append({
                    'name': name,
                    'phone': phone,
                    'vin': vin[:17],
                    'car_model': car_model,
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

    body = json.loads(event.get('body') or '{}')

    filename = body.get('filename', 'report.txt')
    content_b64 = body.get('content', '')

    try:
        text = base64.b64decode(content_b64).decode('utf-8-sig')
    except Exception:
        try:
            text = base64.b64decode(content_b64).decode('cp1251')
        except Exception as e:
            return {'statusCode': 400, 'headers': CORS, 'body': json.dumps({'error': f'Ошибка декодирования файла: {str(e)}'}, ensure_ascii=False)}

    clients = parse_txt(text)
    if not clients:
        return {'statusCode': 422, 'headers': CORS, 'body': json.dumps({'error': 'Не удалось распознать клиентов в файле. Проверьте формат.'}, ensure_ascii=False)}

    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Создаём запись отчёта
    cur.execute(
        "INSERT INTO reports (filename, uploaded_by, clients_count) VALUES (%s, %s, %s) RETURNING id",
        (filename, None, len(clients))
    )
    report_id = cur.fetchone()['id']

    added = 0
    updated = 0

    for c in clients:
        # Проверяем существующую запись по VIN + order_number
        cur.execute(
            "SELECT id FROM clients WHERE vin = %s AND order_number = %s",
            (c['vin'], c['order_number'])
        )
        existing = cur.fetchone()

        if existing:
            cur.execute(
                """UPDATE clients SET
                    name = %s, phone = %s, work = %s, work_date = %s, mileage = %s,
                    report_id = %s, updated_at = NOW()
                WHERE id = %s""",
                (c['name'], c['phone'], c['work'], c['work_date'], c['mileage'], report_id, existing['id'])
            )
            updated += 1
        else:
            cur.execute(
                """INSERT INTO clients (name, phone, vin, work, work_date, mileage, order_number, report_id, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')""",
                (c['name'], c['phone'], c['vin'], c['work'], c['work_date'], c['mileage'], c['order_number'], report_id)
            )
            added += 1

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
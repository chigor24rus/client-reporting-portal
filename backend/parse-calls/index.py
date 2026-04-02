"""
Парсинг и сохранение отчёта звонков из 1С.
Принимает текстовый файл в base64, парсит, сохраняет по мастерам и месяцу.
"""
import json
import os
import base64
import re
import psycopg2
from datetime import datetime


TRACKED_MASTERS = [
    "Гармашев Сергей Владимирович",
    "Пилипенко Александр Петрович",
    "Седов Федор Иванович",
    "Завистовский Владимир Андреевич",
]


def parse_report(text: str) -> dict:
    """
    Парсит текст отчёта 1С по звонкам.
    Возвращает dict: { master_name: { 'incoming': set(doc_refs), 'outgoing': set(doc_refs) } }
    и period_month (первый день месяца из дат отчёта).
    """
    lines = text.splitlines()
    current_master = None
    current_call_type = None
    result = {}
    first_date = None

    date_pattern = re.compile(r'^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}')

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Строка с данными звонка (начинается с даты)
        if date_pattern.match(stripped):
            parts = [p.strip() for p in stripped.split('\t')]
            # parts[0] = дата, parts[1] = контрагент (может быть пусто),
            # parts[2] = телефон, parts[3] = документ, parts[4] = Прослушать, parts[5] = кол-во
            if len(parts) >= 4:
                doc_ref = parts[3] if len(parts) > 3 else ''
                # Извлекаем дату для определения месяца
                try:
                    dt = datetime.strptime(parts[0], '%d.%m.%Y %H:%M:%S')
                    if first_date is None:
                        first_date = dt
                except Exception:
                    pass

                if current_master and current_call_type and doc_ref:
                    if current_master not in result:
                        result[current_master] = {'incoming': set(), 'outgoing': set()}
                    if current_call_type == 'incoming':
                        result[current_master]['incoming'].add(doc_ref)
                    elif current_call_type == 'outgoing':
                        result[current_master]['outgoing'].add(doc_ref)
            continue

        # Определяем тип звонка
        if stripped.startswith('Входящее'):
            current_call_type = 'incoming'
            continue
        if stripped.startswith('Исходящее'):
            current_call_type = 'outgoing'
            continue

        # Определяем мастера: строка вида "Фамилия Имя Отчество\t103\tAsterisk\t..."
        # Или просто внутренний телефон без мастера
        tab_parts = stripped.split('\t')
        if len(tab_parts) >= 2:
            candidate = tab_parts[0].strip()
            # Если первая часть — похоже на ФИО (содержит пробелы, кириллица, не дата)
            if (candidate and
                not date_pattern.match(candidate) and
                re.search(r'[а-яА-ЯёЁ]', candidate) and
                len(candidate.split()) >= 2 and
                candidate not in ('Входящее', 'Исходящее', 'Итого', 'Пользователь', 'Тип звонка', 'Дата')):
                current_master = candidate
                current_call_type = None
            elif candidate == '' or (candidate and not re.search(r'[а-яА-ЯёЁ]', candidate)):
                # Анонимный пользователь (пустое имя или цифры)
                if len(tab_parts) >= 2 and tab_parts[1].strip().isdigit():
                    current_master = None
                    current_call_type = None

    period_month = None
    if first_date:
        period_month = first_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    return result, period_month


def handler(event: dict, context) -> dict:
    """Загрузка и парсинг отчёта звонков из 1С. Только для администраторов."""
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token, X-Session-Id',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    if event.get('httpMethod') != 'POST':
        return {'statusCode': 405, 'headers': cors, 'body': json.dumps({'error': 'Method not allowed'})}

    body = json.loads(event.get('body') or '{}')
    file_b64 = body.get('file')
    uploaded_by = body.get('userId')

    if not file_b64:
        return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'Файл не передан'})}

    # Декодируем файл
    try:
        file_bytes = base64.b64decode(file_b64)
        # Пробуем UTF-8, потом cp1251
        try:
            text = file_bytes.decode('utf-8')
        except Exception:
            text = file_bytes.decode('cp1251')
    except Exception as e:
        return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': f'Ошибка декодирования: {str(e)}'})}

    parsed, period_month = parse_report(text)

    if not period_month:
        return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'Не удалось определить период из файла'})}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    saved = []
    for master in TRACKED_MASTERS:
        data = parsed.get(master, {'incoming': set(), 'outgoing': set()})
        incoming = len(data['incoming'])
        outgoing = len(data['outgoing'])

        cur.execute("""
            INSERT INTO calls_report (master_name, period_month, incoming_unique, outgoing_unique, uploaded_by, updated_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (master_name, period_month)
            DO UPDATE SET incoming_unique = EXCLUDED.incoming_unique,
                          outgoing_unique = EXCLUDED.outgoing_unique,
                          uploaded_by = EXCLUDED.uploaded_by,
                          updated_at = NOW()
        """, (master, period_month.date(), incoming, outgoing, uploaded_by))

        saved.append({'master': master, 'incoming': incoming, 'outgoing': outgoing})

    conn.commit()
    cur.close()
    conn.close()

    return {
        'statusCode': 200,
        'headers': cors,
        'body': json.dumps({
            'ok': True,
            'period': period_month.strftime('%Y-%m'),
            'stats': saved
        }, ensure_ascii=False)
    }

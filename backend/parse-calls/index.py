"""
Парсинг CSV-отчёта звонков из IP-телефонии.
Поля: Date;A;B;CID;Pressed;Queue;Talk-time;Waiting;Transfer;Calltype;Code
Мастера определяются по внутренним номерам: 101-104.
"""
import json
import os
import base64
import csv
import io
import psycopg2
from datetime import datetime, date
from collections import defaultdict


MASTERS = {
    '101': 'Пилипенко Александр',
    '102': 'Седов Федор',
    '103': 'Гармашев Сергей',
    '104': 'Завистовский Владимир',
}

INTERNAL_NUMBERS = set(MASTERS.keys())


def normalize_phone(raw: str) -> str:
    digits = ''.join(c for c in raw if c.isdigit())
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    return digits


def parse_csv(text: str) -> tuple:
    """
    Парсит CSV из IP-телефонии.
    Возвращает:
      stats = { ext: { day: { 'out': set(phones), 'out_answered': set(phones), 'in': set(phones), 'missed': set(phones) } } }
      period_month: date (первый день месяца)
    """
    reader = csv.DictReader(io.StringIO(text), delimiter=';')

    # ext -> day -> { out, out_answered, in, missed_raw }
    stats = defaultdict(lambda: defaultdict(lambda: {
        'out': set(),
        'out_answered': set(),
        'in': set(),
        'missed_raw': set(),
    }))

    first_date = None

    for row in reader:
        calltype = (row.get('Calltype') or '').strip().upper()
        code = (row.get('Code') or '').strip().upper()
        a = (row.get('A') or '').strip()
        b = (row.get('B') or '').strip()
        date_str = (row.get('Date') or '').strip()

        if calltype == 'LOCAL':
            continue

        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
        except Exception:
            continue

        day = dt.date()
        if first_date is None:
            first_date = day

        if calltype == 'OUT':
            # A = внутренний номер мастера, B = номер клиента
            ext = a
            client_raw = b
            if ext not in INTERNAL_NUMBERS or not client_raw:
                continue
            client = normalize_phone(client_raw)
            if not client:
                continue
            stats[ext][day]['out'].add(client)
            if code == 'ANSWERED':
                stats[ext][day]['out_answered'].add(client)

        elif calltype == 'IN':
            # B = внутренний номер мастера (если принял), A = номер клиента
            ext = b
            client_raw = a
            if ext not in INTERNAL_NUMBERS:
                continue
            client = normalize_phone(client_raw)
            if not client:
                continue
            if code == 'ANSWERED':
                stats[ext][day]['in'].add(client)
            else:
                stats[ext][day]['missed_raw'].add(client)

    period_month = None
    if first_date:
        period_month = first_date.replace(day=1)

    return stats, period_month


def aggregate(stats: dict) -> dict:
    """
    Агрегирует по мастеру за весь период:
    - incoming: уникальные входящие (ANSWERED) по дням, суммарно
    - outgoing: уникальные исходящие по дням (любой код), суммарно
    - missed: пропущенные без успешного перезвона в тот же день
    """
    result = {}
    for ext, days in stats.items():
        incoming = 0
        outgoing = 0
        missed = 0
        for day, d in days.items():
            incoming += len(d['in'])
            outgoing += len(d['out'])
            # пропущенные = те кому не перезвонили успешно в тот же день
            missed += len(d['missed_raw'] - d['out_answered'])
        result[ext] = {'incoming': incoming, 'outgoing': outgoing, 'missed': missed}
    return result


def handler(event: dict, context) -> dict:
    """Загрузка и парсинг CSV-отчёта звонков из IP-телефонии."""
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

    try:
        file_bytes = base64.b64decode(file_b64)
        try:
            text = file_bytes.decode('utf-8-sig')
        except Exception:
            text = file_bytes.decode('cp1251')
    except Exception as e:
        return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': f'Ошибка декодирования: {str(e)}'})}

    raw_stats, period_month = parse_csv(text)

    if not period_month:
        return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'Не удалось определить период из файла. Проверьте формат CSV.'})}

    aggregated = aggregate(raw_stats)

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    saved = []
    for ext, master_name in MASTERS.items():
        data = aggregated.get(ext, {'incoming': 0, 'outgoing': 0, 'missed': 0})
        cur.execute("""
            INSERT INTO calls_report (master_name, period_month, incoming_unique, outgoing_unique, missed_unique, uploaded_by, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (master_name, period_month)
            DO UPDATE SET incoming_unique = EXCLUDED.incoming_unique,
                          outgoing_unique = EXCLUDED.outgoing_unique,
                          missed_unique = EXCLUDED.missed_unique,
                          uploaded_by = EXCLUDED.uploaded_by,
                          updated_at = NOW()
        """, (master_name, period_month, data['incoming'], data['outgoing'], data['missed'], uploaded_by))

        saved.append({
            'master': master_name,
            'incoming': data['incoming'],
            'outgoing': data['outgoing'],
            'missed': data['missed'],
        })

    conn.commit()
    cur.close()
    conn.close()

    return {
        'statusCode': 200,
        'headers': cors,
        'body': json.dumps({
            'ok': True,
            'period': period_month.strftime('%Y-%m'),
            'stats': saved,
        }, ensure_ascii=False)
    }

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
from datetime import datetime
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
      master_stats = { ext: { day: { out, out_answered, in, missed_raw } } }
      company_stats = { day: { missed_raw: set, answered_out: set } }
        — входящие NO ANSWER без привязки к мастеру (B пустое или не внутренний)
      period_month: date
    """
    reader = csv.DictReader(io.StringIO(text), delimiter=';')

    master_stats = defaultdict(lambda: defaultdict(lambda: {
        'out': set(),
        'out_answered': set(),
        'in': set(),
        'missed_raw': set(),
    }))

    # day -> { missed_raw: set(phones), answered_out: set(phones) }
    company_stats = defaultdict(lambda: {'missed_raw': set(), 'answered_out': set()})

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

        # Коррекция: 03.04.2026 Завистовский работал с номера 103 вместо 104
        from datetime import date as date_type
        if day == date_type(2026, 4, 3):
            if calltype == 'OUT' and a == '103':
                a = '104'
            elif calltype == 'IN' and b == '103':
                b = '104'

        if calltype == 'OUT':
            ext = a
            client_raw = b
            if ext not in INTERNAL_NUMBERS or not client_raw:
                continue
            client = normalize_phone(client_raw)
            if not client:
                continue
            master_stats[ext][day]['out'].add(client)
            if code == 'ANSWERED':
                master_stats[ext][day]['out_answered'].add(client)
                # Любой успешный исходящий — считаем перезвоном по компании
                company_stats[day]['answered_out'].add(client)

        elif calltype == 'IN':
            ext = b
            client_raw = a
            if ext in INTERNAL_NUMBERS:
                # Звонок попал на конкретного мастера
                client = normalize_phone(client_raw)
                if not client:
                    continue
                if code == 'ANSWERED':
                    master_stats[ext][day]['in'].add(client)
                else:
                    master_stats[ext][day]['missed_raw'].add(client)
            else:
                # Звонок на общую линию (B пустое или общий номер)
                client = normalize_phone(client_raw)
                if not client:
                    continue
                if code != 'ANSWERED':
                    company_stats[day]['missed_raw'].add(client)

    period_month = None
    last_date = None
    if first_date:
        period_month = first_date.replace(day=1)
        all_days = list(company_stats.keys())
        for ext_days in master_stats.values():
            all_days.extend(ext_days.keys())
        last_date = max(all_days) if all_days else first_date

    return master_stats, company_stats, period_month, last_date


def aggregate_masters(master_stats: dict) -> dict:
    result = {}
    for ext, days in master_stats.items():
        incoming = outgoing = missed = 0
        for day, d in days.items():
            incoming += len(d['in'])
            outgoing += len(d['out'])
            missed += len(d['missed_raw'] - d['out_answered'])
        result[ext] = {'incoming': incoming, 'outgoing': outgoing, 'missed': missed}
    return result


def aggregate_company(company_stats: dict) -> int:
    """Пропущенные по компании = номера которым никто не перезвонил за весь день."""
    total = 0
    for day, d in company_stats.items():
        total += len(d['missed_raw'] - d['answered_out'])
    return total


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

    master_stats, company_stats, period_month, last_date = parse_csv(text)

    if not period_month:
        return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'Не удалось определить период из файла. Проверьте формат CSV.'})}

    aggregated = aggregate_masters(master_stats)
    company_missed = aggregate_company(company_stats)

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    saved = []
    for ext, master_name in MASTERS.items():
        data = aggregated.get(ext, {'incoming': 0, 'outgoing': 0, 'missed': 0})
        cm = company_missed if ext == '103' else 0
        cur.execute("""
            INSERT INTO calls_report (master_name, period_month, incoming_unique, outgoing_unique, missed_unique, company_missed, last_date, uploaded_by, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (master_name, period_month)
            DO UPDATE SET incoming_unique = EXCLUDED.incoming_unique,
                          outgoing_unique = EXCLUDED.outgoing_unique,
                          missed_unique = EXCLUDED.missed_unique,
                          company_missed = EXCLUDED.company_missed,
                          last_date = EXCLUDED.last_date,
                          uploaded_by = EXCLUDED.uploaded_by,
                          updated_at = NOW()
        """, (master_name, period_month, data['incoming'], data['outgoing'], data['missed'], cm, last_date, uploaded_by))

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
            'company_missed': company_missed,
        }, ensure_ascii=False)
    }
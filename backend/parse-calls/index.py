"""
Парсинг CSV-отчёта звонков из IP-телефонии.
Поля: Date;A;B;CID;Pressed;Queue;Talk-time;Waiting;Transfer;Calltype;Code
Мастера определяются по внутренним номерам: 101-104.

Логика мержа: если новый файл покрывает уже загруженный период (first_date..last_date) —
данные заменяются. Если файл за другой диапазон дат — суммируется к существующему.
"""
import json
import os
import base64
import csv
import io
import psycopg2
from datetime import datetime, date as date_type
from collections import defaultdict


MASTERS = {
    '101': 'Пилипенко Александр',
    '102': 'Седов Федор',
    '103': 'Гармашев Сергей',
    '104': 'Завистовский Владимир',
}

INTERNAL_NUMBERS = set(MASTERS.keys())

# Временные правила коррекции внутренних номеров: (дата, исходный_номер) -> правильный_номер
# Убирать после загрузки соответствующего отчёта
NUMBER_CORRECTIONS: dict[tuple, str] = {
    # 03.04.2026: Завистовский работал с номера 103 вместо своего 104
    (date_type(2026, 4, 3), '103'): '104',
}


def normalize_phone(raw: str) -> str:
    digits = ''.join(c for c in raw if c.isdigit())
    if digits.startswith('8') and len(digits) == 11:
        digits = '7' + digits[1:]
    return digits


def apply_correction(day: date_type, ext: str) -> str:
    return NUMBER_CORRECTIONS.get((day, ext), ext)


def parse_csv(text: str) -> tuple:
    """
    Парсит CSV из IP-телефонии.
    Возвращает:
      master_stats = { ext: { day: { out, out_answered, in, missed_raw } } }
      company_stats = { day: { missed_raw: set, answered_out: set } }
      period_month: date
      first_date: date
      last_date: date
    """
    reader = csv.DictReader(io.StringIO(text), delimiter=';')

    master_stats = defaultdict(lambda: defaultdict(lambda: {
        'out': set(),
        'out_answered': set(),
        'in': set(),
        'missed_raw': set(),
    }))

    company_stats = defaultdict(lambda: {'missed_raw': set(), 'answered_out': set()})

    first_date = None
    last_date = None

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
        if first_date is None or day < first_date:
            first_date = day
        if last_date is None or day > last_date:
            last_date = day

        if calltype == 'OUT':
            ext = apply_correction(day, a)
            client_raw = b
            if ext not in INTERNAL_NUMBERS or not client_raw:
                continue
            client = normalize_phone(client_raw)
            if not client:
                continue
            master_stats[ext][day]['out'].add(client)
            if code == 'ANSWERED':
                master_stats[ext][day]['out_answered'].add(client)
                company_stats[day]['answered_out'].add(client)

        elif calltype == 'IN':
            ext = apply_correction(day, b)
            client_raw = a
            if ext in INTERNAL_NUMBERS:
                client = normalize_phone(client_raw)
                if not client:
                    continue
                if code == 'ANSWERED':
                    master_stats[ext][day]['in'].add(client)
                else:
                    master_stats[ext][day]['missed_raw'].add(client)
            else:
                client = normalize_phone(client_raw)
                if not client:
                    continue
                if code != 'ANSWERED':
                    company_stats[day]['missed_raw'].add(client)

    period_month = first_date.replace(day=1) if first_date else None
    return master_stats, company_stats, period_month, first_date, last_date


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

    master_stats, company_stats, period_month, first_date, last_date = parse_csv(text)

    if not period_month:
        return {'statusCode': 400, 'headers': cors, 'body': json.dumps({'error': 'Не удалось определить период из файла. Проверьте формат CSV.'})}

    aggregated = aggregate_masters(master_stats)
    company_missed_new = aggregate_company(company_stats)

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # Загружаем существующие данные за этот месяц
    cur.execute("""
        SELECT master_name, incoming_unique, outgoing_unique, missed_unique, company_missed, first_date, last_date
        FROM calls_report
        WHERE period_month = %s AND incoming_unique >= 0
    """, (period_month,))
    existing = {row[0]: {
        'incoming': row[1], 'outgoing': row[2], 'missed': row[3],
        'company_missed': row[4],
        'first_date': row[5], 'last_date': row[6],
    } for row in cur.fetchall()}

    saved = []
    for ext, master_name in MASTERS.items():
        new_data = aggregated.get(ext, {'incoming': 0, 'outgoing': 0, 'missed': 0})
        cm_new = company_missed_new if ext == '103' else 0

        ex = existing.get(master_name)
        if ex:
            ex_first = ex['first_date']
            ex_last = ex['last_date']
            # Новый файл полностью перекрывает старый период — заменяем
            if ex_first and ex_last and first_date <= ex_first and last_date >= ex_last:
                final_incoming = new_data['incoming']
                final_outgoing = new_data['outgoing']
                final_missed = new_data['missed']
                final_cm = cm_new
                final_first = first_date
                final_last = last_date
            # Периоды не пересекаются или новый добавляет дни — суммируем
            else:
                final_incoming = ex['incoming'] + new_data['incoming']
                final_outgoing = ex['outgoing'] + new_data['outgoing']
                final_missed = ex['missed'] + new_data['missed']
                final_cm = ex['company_missed'] + cm_new
                final_first = min(ex_first, first_date) if ex_first else first_date
                final_last = max(ex_last, last_date) if ex_last else last_date
        else:
            final_incoming = new_data['incoming']
            final_outgoing = new_data['outgoing']
            final_missed = new_data['missed']
            final_cm = cm_new
            final_first = first_date
            final_last = last_date

        cur.execute("""
            INSERT INTO calls_report (master_name, period_month, incoming_unique, outgoing_unique,
                                      missed_unique, company_missed, first_date, last_date, uploaded_by, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (master_name, period_month)
            DO UPDATE SET incoming_unique = EXCLUDED.incoming_unique,
                          outgoing_unique = EXCLUDED.outgoing_unique,
                          missed_unique   = EXCLUDED.missed_unique,
                          company_missed  = EXCLUDED.company_missed,
                          first_date      = EXCLUDED.first_date,
                          last_date       = EXCLUDED.last_date,
                          uploaded_by     = EXCLUDED.uploaded_by,
                          updated_at      = NOW()
        """, (master_name, period_month, final_incoming, final_outgoing,
              final_missed, final_cm, final_first, final_last, uploaded_by))

        saved.append({'master': master_name, 'incoming': final_incoming,
                      'outgoing': final_outgoing, 'missed': final_missed})

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
            'company_missed': company_missed_new,
        }, ensure_ascii=False)
    }

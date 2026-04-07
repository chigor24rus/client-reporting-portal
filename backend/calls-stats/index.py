"""
Получение статистики звонков по мастерам за выбранный месяц или все месяцы.
"""
import json
import os
import psycopg2


TRACKED_MASTERS = [
    "Гармашев Сергей Владимирович",
    "Пилипенко Александр Петрович",
    "Седов Федор Иванович",
    "Завистовский Владимир Андреевич",
]


def handler(event: dict, context) -> dict:
    """Возвращает статистику звонков по 4 мастерам. GET ?month=2026-04 или без параметра — все месяцы."""
    cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Auth-Token, X-Session-Id',
    }

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors, 'body': ''}

    params = event.get('queryStringParameters') or {}
    month = params.get('month')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    if month:
        cur.execute("""
            SELECT master_name, incoming_unique, outgoing_unique, missed_unique,
                   TO_CHAR(period_month, 'YYYY-MM') as month
            FROM calls_report
            WHERE TO_CHAR(period_month, 'YYYY-MM') = %s
            ORDER BY master_name
        """, (month,))
    else:
        cur.execute("""
            SELECT master_name, incoming_unique, outgoing_unique, missed_unique,
                   TO_CHAR(period_month, 'YYYY-MM') as month
            FROM calls_report
            ORDER BY period_month DESC, master_name
        """)

    rows = cur.fetchall()

    # Получаем доступные месяцы
    cur.execute("""
        SELECT DISTINCT TO_CHAR(period_month, 'YYYY-MM') as month
        FROM calls_report
        ORDER BY month DESC
    """)
    months = [r[0] for r in cur.fetchall()]

    cur.close()
    conn.close()

    stats = [
        {
            'master': row[0],
            'incoming': row[1],
            'outgoing': row[2],
            'missed': row[3],
            'month': row[4],
        }
        for row in rows
    ]

    # Если запрошен конкретный месяц — дополняем нулями тех мастеров, у кого нет данных
    if month:
        existing = {s['master'] for s in stats}
        for master in TRACKED_MASTERS:
            if master not in existing:
                stats.append({'master': master, 'incoming': 0, 'outgoing': 0, 'missed': 0, 'month': month})
        stats.sort(key=lambda x: TRACKED_MASTERS.index(x['master']) if x['master'] in TRACKED_MASTERS else 99)

    return {
        'statusCode': 200,
        'headers': cors,
        'body': json.dumps({'stats': stats, 'months': months}, ensure_ascii=False)
    }
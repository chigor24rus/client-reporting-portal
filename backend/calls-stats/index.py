"""
Получение статистики звонков по мастерам за выбранный месяц или все месяцы.
"""
import json
import os
import psycopg2


TRACKED_MASTERS = [
    'Гармашев Сергей',
    'Пилипенко Александр',
    'Седов Федор',
    'Завистовский Владимир',
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
              AND incoming_unique >= 0
            ORDER BY master_name
        """, (month,))
    else:
        cur.execute("""
            SELECT master_name, incoming_unique, outgoing_unique, missed_unique,
                   TO_CHAR(period_month, 'YYYY-MM') as month
            FROM calls_report
            WHERE incoming_unique >= 0
            ORDER BY period_month DESC, master_name
        """)

    rows = cur.fetchall()

    # Доступные месяцы
    cur.execute("""
        SELECT DISTINCT TO_CHAR(period_month, 'YYYY-MM') as month
        FROM calls_report
        WHERE incoming_unique >= 0
        ORDER BY month DESC
    """)
    months = [r[0] for r in cur.fetchall()]

    # Общие пропущенные + последняя дата данных
    cur.execute("""
        SELECT COALESCE(SUM(company_missed), 0), MAX(last_date)
        FROM calls_report
        WHERE incoming_unique >= 0
    """)
    agg = cur.fetchone()
    company_missed = int(agg[0])
    last_date = agg[1].strftime('%d.%m.%Y') if agg[1] else None

    # Пропущенные по каждому месяцу отдельно
    cur.execute("""
        SELECT TO_CHAR(period_month, 'YYYY-MM'), COALESCE(SUM(company_missed), 0)
        FROM calls_report
        WHERE incoming_unique >= 0
        GROUP BY period_month
        ORDER BY period_month DESC
    """)
    missed_by_month = {row[0]: int(row[1]) for row in cur.fetchall()}

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

    return {
        'statusCode': 200,
        'headers': cors,
        'body': json.dumps({
            'stats': stats,
            'months': months,
            'company_missed': company_missed,
            'missed_by_month': missed_by_month,
            'last_date': last_date,
        }, ensure_ascii=False)
    }
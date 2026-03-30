INSERT INTO clients (name, phone, vin, work, work_date, mileage, order_number, report_id, status)
VALUES (
    'Сивова Людмила Леонидовна',
    '+79620777405',
    'MJ55S-123283',
    'Масло и масляный фильтр двигателя - замена',
    '2025-11-22',
    85754,
    'ИПЧ0021330',
    (SELECT id FROM reports ORDER BY id DESC LIMIT 1),
    'pending'
)
ON CONFLICT (vin, order_number, work) DO NOTHING;
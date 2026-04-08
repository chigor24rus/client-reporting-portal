-- Исключаем все оставшиеся активные работы клиентов, у которых уже есть результат 3, 4 или 8
UPDATE clients
SET is_excluded = TRUE,
    status = 'done',
    result = subq.exclude_result,
    result_at = COALESCE(result_at, NOW()),
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (phone)
        phone,
        result AS exclude_result
    FROM clients
    WHERE is_excluded = TRUE
      AND result IN ('3', '4', '8')
    ORDER BY phone, id
) subq
WHERE clients.phone = subq.phone
  AND clients.is_excluded = FALSE;

UPDATE clients
SET birth_date = subq.birth_date
FROM (
    SELECT phone, MAX(birth_date) AS birth_date
    FROM clients
    WHERE birth_date IS NOT NULL
    GROUP BY phone
) subq
WHERE clients.phone = subq.phone
  AND clients.birth_date IS NULL;

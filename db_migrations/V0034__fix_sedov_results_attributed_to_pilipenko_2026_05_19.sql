UPDATE t_p48317287_client_reporting_por.clients
SET master_id = 1, updated_at = NOW()
WHERE id IN (4903, 7456)
  AND master_id = 5
  AND DATE(result_at) = '2026-05-19';
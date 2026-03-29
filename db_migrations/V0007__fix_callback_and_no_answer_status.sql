UPDATE t_p48317287_client_reporting_por.clients
SET status = 'pending', updated_at = NOW()
WHERE result IN ('5', '7') AND status = 'done' AND is_excluded = FALSE;
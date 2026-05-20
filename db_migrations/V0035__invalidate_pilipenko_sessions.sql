UPDATE t_p48317287_client_reporting_por.sessions
SET token = md5(random()::text || token),
    last_used_at = '2000-01-01'::timestamp
WHERE user_id = 8;
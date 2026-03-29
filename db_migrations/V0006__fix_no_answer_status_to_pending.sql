-- Сбрасываем status = 'pending' для всех записей с result = '7' (Нет ответа), которые ошибочно стали done
UPDATE t_p48317287_client_reporting_por.clients
SET status = 'pending', updated_at = NOW()
WHERE result = '7' AND status = 'done' AND is_excluded = FALSE;
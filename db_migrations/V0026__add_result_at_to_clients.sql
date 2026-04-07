ALTER TABLE clients ADD COLUMN IF NOT EXISTS result_at TIMESTAMP;

-- Для уже существующих записей с результатом — ставим updated_at как приближение
UPDATE clients SET result_at = updated_at WHERE result IS NOT NULL AND result_at IS NULL;
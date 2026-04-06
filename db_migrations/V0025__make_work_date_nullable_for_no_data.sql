ALTER TABLE clients ALTER COLUMN work_date SET DEFAULT NULL;
UPDATE clients SET work_date = NULL WHERE is_no_data = TRUE AND work_date IS NOT NULL;
ALTER TABLE clients ALTER COLUMN work_date TYPE DATE USING work_date::DATE;
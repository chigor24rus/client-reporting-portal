CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_vin_work_no_data
  ON clients (vin, work)
  WHERE is_no_data = TRUE;
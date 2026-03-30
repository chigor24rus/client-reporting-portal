DROP INDEX IF EXISTS idx_clients_vin_order;
CREATE UNIQUE INDEX idx_clients_vin_order_work ON clients (vin, order_number, work);
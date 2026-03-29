ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS birth_date date NULL,
  ADD COLUMN IF NOT EXISTS total_spent numeric(12,2) NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE TABLE IF NOT EXISTS t_p48317287_client_reporting_por.calls_report (
  id SERIAL PRIMARY KEY,
  master_name VARCHAR(255) NOT NULL,
  period_month DATE NOT NULL,
  incoming_unique INT NOT NULL DEFAULT 0,
  outgoing_unique INT NOT NULL DEFAULT 0,
  uploaded_by INT REFERENCES t_p48317287_client_reporting_por.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS calls_report_master_month_idx
  ON t_p48317287_client_reporting_por.calls_report (master_name, period_month);

CREATE TABLE IF NOT EXISTS t_p48317287_client_reporting_por.calls_raw (
  id SERIAL PRIMARY KEY,
  master_name VARCHAR(255) NOT NULL,
  call_type VARCHAR(50) NOT NULL,
  call_datetime TIMESTAMPTZ NOT NULL,
  phone VARCHAR(50),
  document_ref VARCHAR(500),
  period_month DATE NOT NULL,
  uploaded_by INT REFERENCES t_p48317287_client_reporting_por.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calls_raw_master_month_idx
  ON t_p48317287_client_reporting_por.calls_raw (master_name, period_month);

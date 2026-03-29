CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'master')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE masters (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  clients_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  vin VARCHAR(17) NOT NULL,
  work TEXT NOT NULL,
  work_date DATE NOT NULL,
  mileage INTEGER,
  order_number VARCHAR(100),
  master_id INTEGER REFERENCES masters(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  result VARCHAR(30),
  result_note TEXT,
  callback_date DATE,
  is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
  report_id INTEGER REFERENCES reports(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(50),
  entity_id INTEGER,
  details JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

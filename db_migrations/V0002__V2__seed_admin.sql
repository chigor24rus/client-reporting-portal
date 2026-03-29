INSERT INTO users (name, phone, password_hash, role)
SELECT 'Руководитель', '+79000000001', '1234', 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE phone = '+79000000001'
);

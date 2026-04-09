CREATE TABLE t_p48317287_client_reporting_por.calls_missed (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(50) NOT NULL,
    call_date DATE NOT NULL,
    period_month DATE NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    uploaded_by INTEGER NULL REFERENCES t_p48317287_client_reporting_por.users(id)
);

CREATE INDEX idx_calls_missed_period ON t_p48317287_client_reporting_por.calls_missed(period_month);
CREATE INDEX idx_calls_missed_date ON t_p48317287_client_reporting_por.calls_missed(call_date);
CREATE INDEX idx_calls_missed_phone ON t_p48317287_client_reporting_por.calls_missed(phone);
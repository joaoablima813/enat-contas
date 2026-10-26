CREATE TABLE excel_access (
  id integer PRIMARY KEY CHECK (id = 1),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

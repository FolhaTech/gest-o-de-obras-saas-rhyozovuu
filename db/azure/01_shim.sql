-- Camada mínima de compatibilidade com o Supabase (schemas auth e storage).
-- Roda no banco da aplicação, ANTES de 02_schema.sql.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aud text DEFAULT 'authenticated',
  role text DEFAULT 'authenticated',
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  confirmation_sent_at timestamptz,
  recovery_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{"provider": "email", "providers": ["email"]}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  phone text,
  banned_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON auth.users (lower(email));

-- Lidos pelas políticas RLS, a partir das claims do JWT definidas pela API a cada requisição.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Arquivos ficam no próprio Postgres (coluna data), pois o servidor só oferece PostgreSQL.
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  data bytea,
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Pedaços de uploads grandes (a Vercel limita o corpo de cada requisição a ~4,5 MB).
CREATE TABLE IF NOT EXISTS storage.upload_chunks (
  upload_id uuid NOT NULL,
  idx integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (upload_id, idx)
);

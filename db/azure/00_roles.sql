-- Roda UMA vez no servidor (banco "postgres"). Papéis são globais no servidor,
-- por isso levam o prefixo "obras_" para não colidir com outros projetos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'obras_anon') THEN
    CREATE ROLE obras_anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'obras_authenticated') THEN
    CREATE ROLE obras_authenticated NOLOGIN NOINHERIT;
  END IF;
END $$;

-- O usuário da aplicação precisa poder trocar para esses papéis (SET LOCAL ROLE)
-- para que o RLS seja aplicado a cada requisição, como faz o PostgREST.
GRANT obras_anon TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;
GRANT obras_authenticated TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;

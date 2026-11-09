-- Roda DEPOIS de 02_schema.sql. O RLS continua sendo a barreira de acesso por linha.
GRANT USAGE ON SCHEMA public, auth, storage TO obras_anon, obras_authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO obras_anon, obras_authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO obras_anon, obras_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO obras_anon, obras_authenticated;
GRANT SELECT ON storage.buckets TO obras_anon, obras_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO obras_anon, obras_authenticated;

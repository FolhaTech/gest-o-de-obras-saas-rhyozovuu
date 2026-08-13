// This legacy mock-backed store has been retired.
// The app now reads its data directly from Supabase via the `useData` / `useDataFilter`
// hooks (src/hooks/use-data.tsx) and the typed Supabase client (src/lib/supabase/client.ts).
//
// No component imports this module anymore. The file is kept (empty) only so that
// any stale references do not break the build; it is intentionally a no-op.
export {}

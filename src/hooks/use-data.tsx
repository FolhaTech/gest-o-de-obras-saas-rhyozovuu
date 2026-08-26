import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface UseDataResult<T> {
  data: T[]
  loading: boolean
  error: Error | null
  isTableMissing: boolean
  isNetworkError: boolean
  refetch: () => Promise<void>
}

function isMissingTableError(err: any): boolean {
  if (!err) return false
  const msg = (err.message || '').toLowerCase()
  const code = (err.code || '').toString()
  // PostgREST 42P01: undefined_table, PGRST204/PGRST200, 404 relation does not exist
  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST200' ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('table') && msg.includes('does not exist')) ||
    msg.includes('could not find the table') ||
    msg.includes('not found')
  )
}

function isNetworkOrFetchError(err: any): boolean {
  if (!err) return false
  const msg = (err.message || '').toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('networkrequestfailed') ||
    msg.includes('load failed') ||
    msg.includes('fetch failed')
  )
}

export function useData<T>(table: string, select = '*'): UseDataResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isTableMissing, setIsTableMissing] = useState(false)
  const [isNetworkError, setIsNetworkError] = useState(false)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      const { data: result, error: fetchErr } = await supabase
        .from(table as any)
        .select(select)
        .order('created_at', { ascending: false })

      if (fetchErr) {
        console.warn(`[useData:${table}] Supabase query returned error:`, fetchErr)
        setError(fetchErr as unknown as Error)
        setIsTableMissing(isMissingTableError(fetchErr))
        setIsNetworkError(isNetworkOrFetchError(fetchErr))
        setData([])
      } else {
        setError(null)
        setIsTableMissing(false)
        setIsNetworkError(false)
        if (result) setData(result as unknown as T[])
        else setData([])
      }
    } catch (err: any) {
      console.warn(`[useData:${table}] Exception while fetching:`, err)
      setError(err instanceof Error ? err : new Error(String(err?.message || err)))
      setIsTableMissing(isMissingTableError(err))
      setIsNetworkError(isNetworkOrFetchError(err))
      setData([])
    } finally {
      setLoading(false)
    }
  }, [table, select])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, isTableMissing, isNetworkError, refetch: fetch }
}

export function useDataFilter<T>(
  table: string,
  column: string,
  value: string | undefined,
  select = '*',
): UseDataResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isTableMissing, setIsTableMissing] = useState(false)
  const [isNetworkError, setIsNetworkError] = useState(false)

  const fetch = useCallback(async () => {
    if (!value) {
      setData([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const { data: result, error: fetchErr } = await supabase
        .from(table as any)
        .select(select)
        .eq(column, value)
        .order('created_at', { ascending: false })

      if (fetchErr) {
        console.warn(`[useDataFilter:${table}] Supabase query error:`, fetchErr)
        setError(fetchErr as unknown as Error)
        setIsTableMissing(isMissingTableError(fetchErr))
        setIsNetworkError(isNetworkOrFetchError(fetchErr))
        setData([])
      } else {
        setError(null)
        setIsTableMissing(false)
        setIsNetworkError(false)
        if (result) setData(result as unknown as T[])
        else setData([])
      }
    } catch (err: any) {
      console.warn(`[useDataFilter:${table}] Exception while fetching:`, err)
      setError(err instanceof Error ? err : new Error(String(err?.message || err)))
      setIsTableMissing(isMissingTableError(err))
      setIsNetworkError(isNetworkOrFetchError(err))
      setData([])
    } finally {
      setLoading(false)
    }
  }, [table, column, value, select])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, isTableMissing, isNetworkError, refetch: fetch }
}

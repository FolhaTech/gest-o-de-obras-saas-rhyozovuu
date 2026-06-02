import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useData<T>(table: string, select = '*') {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: result } = await supabase
      .from(table)
      .select(select)
      .order('created_at', { ascending: false })
    if (result) setData(result as unknown as T[])
    setLoading(false)
  }, [table, select])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, refetch: fetch }
}

export function useDataFilter<T>(
  table: string,
  column: string,
  value: string | undefined,
  select = '*',
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!value) return
    setLoading(true)
    const { data: result } = await supabase
      .from(table)
      .select(select)
      .eq(column, value)
      .order('created_at', { ascending: false })
    if (result) setData(result as unknown as T[])
    setLoading(false)
  }, [table, column, value, select])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, refetch: fetch }
}

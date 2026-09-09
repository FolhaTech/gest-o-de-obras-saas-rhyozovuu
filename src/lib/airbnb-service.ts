import { supabase } from '@/lib/supabase/client'
import { isMissingTableError } from '@/lib/formatters'
import { AirbnbProperty, AirbnbRental, AirbnbTransaction, Obra } from '@/types'

const STORAGE_PROPERTIES_KEY = 'gestao_obras_airbnb_properties'
const STORAGE_RENTALS_KEY = 'gestao_obras_airbnb_rentals'
const STORAGE_TRANSACTIONS_KEY = 'gestao_obras_airbnb_transactions'

// ==========================================
// HELPERS LOCAL STORAGE
// ==========================================
function getLocal<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultVal
  } catch {
    return defaultVal
  }
}

function setLocal<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.warn(`[AirbnbService] Erro ao salvar chave ${key} no localStorage:`, e)
  }
}

export const AirbnbService = {
  // ----------------------------------------------------
  // OBRAS CONCLUÍDAS (para vincular ao formulário)
  // ----------------------------------------------------
  async getCompletedWorks(): Promise<Obra[]> {
    try {
      const { data, error } = await supabase
        .from('works')
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        console.warn('[AirbnbService] Erro ao buscar obras:', error)
        return []
      }

      const all = (data || []) as Obra[]
      // Considerar concluídas: status 'completed', 'finished', 'Concluída', 'Finalizada' ou progresso 100%
      return all.filter((w) => {
        const s = (w.status || '').toLowerCase()
        const isCompletedStatus =
          s === 'completed' || s === 'finished' || s === 'concluída' || s === 'finalizada'
        const is100Percent =
          typeof w.progress_percentage === 'number' && w.progress_percentage >= 100
        return isCompletedStatus || is100Percent
      })
    } catch (e) {
      console.warn('[AirbnbService] Exceção ao carregar obras:', e)
      return []
    }
  },

  // ----------------------------------------------------
  // IMÓVEIS (PROPERTIES)
  // ----------------------------------------------------
  async getProperties(): Promise<{ data: AirbnbProperty[]; isFallback: boolean }> {
    try {
      // Tentar Supabase com join simples de works
      const { data, error } = await supabase
        .from('airbnb_properties' as any)
        .select('*, work:works(id, name, address, status)')
        .order('created_at', { ascending: false })

      if (error) {
        if (isMissingTableError(error)) {
          return { data: getLocal<AirbnbProperty[]>(STORAGE_PROPERTIES_KEY, []), isFallback: true }
        }
        console.warn('[AirbnbService] Erro ao buscar imóveis:', error)
        return { data: getLocal<AirbnbProperty[]>(STORAGE_PROPERTIES_KEY, []), isFallback: true }
      }

      if (data) {
        return { data: data as unknown as AirbnbProperty[], isFallback: false }
      }
      return { data: getLocal<AirbnbProperty[]>(STORAGE_PROPERTIES_KEY, []), isFallback: false }
    } catch {
      return { data: getLocal<AirbnbProperty[]>(STORAGE_PROPERTIES_KEY, []), isFallback: true }
    }
  },

  async saveProperty(
    property: Omit<AirbnbProperty, 'id' | 'created_at'> & { id?: string },
  ): Promise<{ data: AirbnbProperty; isFallback: boolean }> {
    const id = property.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const record: AirbnbProperty = {
      ...property,
      id,
      created_at: now,
      status: property.status || 'ativo',
    }

    try {
      const { data, error } = await supabase
        .from('airbnb_properties' as any)
        .upsert({
          id,
          work_id: record.work_id || null,
          name: record.name,
          address: record.address,
          daily_rate: record.daily_rate,
          status: record.status,
          notes: record.notes || null,
        })
        .select('*, work:works(id, name, address, status)')
        .single()

      if (error) {
        if (isMissingTableError(error)) {
          const list = getLocal<AirbnbProperty[]>(STORAGE_PROPERTIES_KEY, [])
          const filtered = list.filter((p) => p.id !== id)
          const updated = [record, ...filtered]
          setLocal(STORAGE_PROPERTIES_KEY, updated)
          return { data: record, isFallback: true }
        }
        // Fallback genérico para não perder os dados
        const list = getLocal<AirbnbProperty[]>(STORAGE_PROPERTIES_KEY, [])
        const filtered = list.filter((p) => p.id !== id)
        const updated = [record, ...filtered]
        setLocal(STORAGE_PROPERTIES_KEY, updated)
        return { data: record, isFallback: true }
      }

      return { data: (data as unknown as AirbnbProperty) || record, isFallback: false }
    } catch {
      const list = getLocal<AirbnbProperty[]>(STORAGE_PROPERTIES_KEY, [])
      const filtered = list.filter((p) => p.id !== id)
      const updated = [record, ...filtered]
      setLocal(STORAGE_PROPERTIES_KEY, updated)
      return { data: record, isFallback: true }
    }
  },

  async deleteProperty(id: string): Promise<void> {
    try {
      await supabase
        .from('airbnb_properties' as any)
        .delete()
        .eq('id', id)
    } catch (e) {
      console.warn('[AirbnbService] Erro ao deletar no Supabase:', e)
    }

    // Limpar também localmente
    const list = getLocal<AirbnbProperty[]>(STORAGE_PROPERTIES_KEY, [])
    setLocal(
      STORAGE_PROPERTIES_KEY,
      list.filter((p) => p.id !== id),
    )

    // Limpar dependências de aluguéis e transações locais
    const rentals = getLocal<AirbnbRental[]>(STORAGE_RENTALS_KEY, [])
    setLocal(
      STORAGE_RENTALS_KEY,
      rentals.filter((r) => r.property_id !== id),
    )

    const txs = getLocal<AirbnbTransaction[]>(STORAGE_TRANSACTIONS_KEY, [])
    setLocal(
      STORAGE_TRANSACTIONS_KEY,
      txs.filter((t) => t.property_id !== id),
    )
  },

  // ----------------------------------------------------
  // ALUGUÉIS / TEMPORADAS (RENTALS)
  // ----------------------------------------------------
  async getRentals(propertyId?: string): Promise<{ data: AirbnbRental[]; isFallback: boolean }> {
    try {
      let query = supabase
        .from('airbnb_rentals' as any)
        .select('*')
        .order('check_in', { ascending: false })

      if (propertyId) {
        query = query.eq('property_id', propertyId)
      }

      const { data, error } = await query

      if (error) {
        const local = getLocal<AirbnbRental[]>(STORAGE_RENTALS_KEY, [])
        return {
          data: propertyId ? local.filter((r) => r.property_id === propertyId) : local,
          isFallback: true,
        }
      }

      return { data: (data as unknown as AirbnbRental[]) || [], isFallback: false }
    } catch {
      const local = getLocal<AirbnbRental[]>(STORAGE_RENTALS_KEY, [])
      return {
        data: propertyId ? local.filter((r) => r.property_id === propertyId) : local,
        isFallback: true,
      }
    }
  },

  async saveRental(
    rental: Omit<AirbnbRental, 'id' | 'created_at'> & { id?: string },
  ): Promise<{ data: AirbnbRental; isFallback: boolean }> {
    const id = rental.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const record: AirbnbRental = {
      ...rental,
      id,
      created_at: now,
    }

    try {
      const { data, error } = await supabase
        .from('airbnb_rentals' as any)
        .upsert({
          id,
          property_id: record.property_id,
          guest_name: record.guest_name || null,
          guests_count: record.guests_count,
          check_in: record.check_in,
          check_out: record.check_out,
          total_value: record.total_value,
          notes: record.notes || null,
        })
        .select()
        .single()

      if (error) {
        const list = getLocal<AirbnbRental[]>(STORAGE_RENTALS_KEY, [])
        const filtered = list.filter((r) => r.id !== id)
        const updated = [record, ...filtered]
        setLocal(STORAGE_RENTALS_KEY, updated)
        return { data: record, isFallback: true }
      }

      return { data: (data as unknown as AirbnbRental) || record, isFallback: false }
    } catch {
      const list = getLocal<AirbnbRental[]>(STORAGE_RENTALS_KEY, [])
      const filtered = list.filter((r) => r.id !== id)
      const updated = [record, ...filtered]
      setLocal(STORAGE_RENTALS_KEY, updated)
      return { data: record, isFallback: true }
    }
  },

  async deleteRental(id: string): Promise<void> {
    try {
      await supabase
        .from('airbnb_rentals' as any)
        .delete()
        .eq('id', id)
    } catch (e) {
      console.warn('[AirbnbService] Erro ao deletar aluguel:', e)
    }

    const list = getLocal<AirbnbRental[]>(STORAGE_RENTALS_KEY, [])
    setLocal(
      STORAGE_RENTALS_KEY,
      list.filter((r) => r.id !== id),
    )
  },

  // ----------------------------------------------------
  // TRANSAÇÕES (RECEITAS / DESPESAS AVULSAS)
  // ----------------------------------------------------
  async getTransactions(
    propertyId?: string,
  ): Promise<{ data: AirbnbTransaction[]; isFallback: boolean }> {
    try {
      let query = supabase
        .from('airbnb_transactions' as any)
        .select('*')
        .order('date', { ascending: false })

      if (propertyId) {
        query = query.eq('property_id', propertyId)
      }

      const { data, error } = await query

      if (error) {
        const local = getLocal<AirbnbTransaction[]>(STORAGE_TRANSACTIONS_KEY, [])
        return {
          data: propertyId ? local.filter((t) => t.property_id === propertyId) : local,
          isFallback: true,
        }
      }

      return { data: (data as unknown as AirbnbTransaction[]) || [], isFallback: false }
    } catch {
      const local = getLocal<AirbnbTransaction[]>(STORAGE_TRANSACTIONS_KEY, [])
      return {
        data: propertyId ? local.filter((t) => t.property_id === propertyId) : local,
        isFallback: true,
      }
    }
  },

  async saveTransaction(
    tx: Omit<AirbnbTransaction, 'id' | 'created_at'> & { id?: string },
  ): Promise<{ data: AirbnbTransaction; isFallback: boolean }> {
    const id = tx.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const record: AirbnbTransaction = {
      ...tx,
      id,
      created_at: now,
    }

    try {
      const { data, error } = await supabase
        .from('airbnb_transactions' as any)
        .upsert({
          id,
          property_id: record.property_id,
          rental_id: record.rental_id || null,
          type: record.type,
          category: record.category,
          description: record.description,
          value: record.value,
          date: record.date,
        })
        .select()
        .single()

      if (error) {
        const list = getLocal<AirbnbTransaction[]>(STORAGE_TRANSACTIONS_KEY, [])
        const filtered = list.filter((t) => t.id !== id)
        const updated = [record, ...filtered]
        setLocal(STORAGE_TRANSACTIONS_KEY, updated)
        return { data: record, isFallback: true }
      }

      return { data: (data as unknown as AirbnbTransaction) || record, isFallback: false }
    } catch {
      const list = getLocal<AirbnbTransaction[]>(STORAGE_TRANSACTIONS_KEY, [])
      const filtered = list.filter((t) => t.id !== id)
      const updated = [record, ...filtered]
      setLocal(STORAGE_TRANSACTIONS_KEY, updated)
      return { data: record, isFallback: true }
    }
  },

  async deleteTransaction(id: string): Promise<void> {
    try {
      await supabase
        .from('airbnb_transactions' as any)
        .delete()
        .eq('id', id)
    } catch (e) {
      console.warn('[AirbnbService] Erro ao deletar transação:', e)
    }

    const list = getLocal<AirbnbTransaction[]>(STORAGE_TRANSACTIONS_KEY, [])
    setLocal(
      STORAGE_TRANSACTIONS_KEY,
      list.filter((t) => t.id !== id),
    )
  },
}

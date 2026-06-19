import { useState, useEffect, useMemo } from 'react'
import { startOfWeek, addDays, subWeeks, addWeeks, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { Equipe, AttendanceRecord, AttendanceExtra } from '@/types'
import { useToast } from '@/hooks/use-toast'

export default function AttendanceTab() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 6 }))
  const [workers, setWorkers] = useState<Equipe[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [extras, setExtras] = useState<AttendanceExtra[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  useEffect(() => {
    fetchData()
  }, [weekStart])

  const fetchData = async () => {
    setLoading(true)
    const startDateStr = format(days[0], 'yyyy-MM-dd')
    const endDateStr = format(days[6], 'yyyy-MM-dd')

    const [workersRes, recordsRes, extrasRes] = await Promise.all([
      supabase.from('team_members').select('*').eq('status', 'active').order('name'),
      supabase
        .from('attendance_records')
        .select('*')
        .gte('date', startDateStr)
        .lte('date', endDateStr),
      supabase.from('attendance_extras').select('*').eq('week_start_date', startDateStr),
    ])

    if (workersRes.data) setWorkers(workersRes.data)
    if (recordsRes.data) setRecords(recordsRes.data)
    if (extrasRes.data) setExtras(extrasRes.data)
    setLoading(false)
  }

  const togglePresence = async (workerId: string, dateStr: string, currentStatus: boolean) => {
    const newStatus = !currentStatus

    // Optimistic update
    setRecords((prev) => {
      const exists = prev.find((r) => r.worker_id === workerId && r.date === dateStr)
      if (exists) return prev.map((r) => (r.id === exists.id ? { ...r, is_present: newStatus } : r))
      return [...prev, { id: 'temp', worker_id: workerId, date: dateStr, is_present: newStatus }]
    })

    const { error } = await supabase
      .from('attendance_records')
      .upsert(
        { worker_id: workerId, date: dateStr, is_present: newStatus },
        { onConflict: 'worker_id,date' },
      )
    if (error) {
      toast({ title: 'Erro ao salvar', variant: 'destructive' })
      fetchData() // revert
    }
  }

  const handleExtraChange = async (
    workerId: string,
    value: string,
    field: 'extra_value' | 'notes',
  ) => {
    const startDateStr = format(days[0], 'yyyy-MM-dd')

    setExtras((prev) => {
      const exists = prev.find((e) => e.worker_id === workerId)
      if (exists)
        return prev.map((e) =>
          e.id === exists.id
            ? { ...e, [field]: field === 'extra_value' ? Number(value) : value }
            : e,
        )
      return [
        ...prev,
        {
          id: 'temp',
          worker_id: workerId,
          week_start_date: startDateStr,
          extra_value: field === 'extra_value' ? Number(value) : 0,
          notes: field === 'notes' ? value : '',
        },
      ]
    })

    const currentExtra = extras.find((e) => e.worker_id === workerId)
    const payload = {
      worker_id: workerId,
      week_start_date: startDateStr,
      extra_value: field === 'extra_value' ? Number(value) : currentExtra?.extra_value || 0,
      notes: field === 'notes' ? value : currentExtra?.notes || '',
    }

    await supabase
      .from('attendance_extras')
      .upsert(payload, { onConflict: 'worker_id,week_start_date' })
  }

  const getDayLabel = (date: Date) => format(date, 'eee', { locale: ptBR }).toUpperCase()

  return (
    <div className="space-y-4 bg-card border rounded-md p-4">
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-lg font-semibold">Controle de Diárias</h2>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setWeekStart((p) => subWeeks(p, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium text-sm">
            {format(days[0], 'dd/MM/yyyy')} até {format(days[6], 'dd/MM/yyyy')}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekStart((p) => addWeeks(p, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Nome / Função</TableHead>
              {days.map((d) => (
                <TableHead key={d.toISOString()} className="text-center w-12">
                  <div className="flex flex-col items-center">
                    <span>{getDayLabel(d)}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {format(d, 'dd/MM')}
                    </span>
                  </div>
                </TableHead>
              ))}
              <TableHead className="text-center">Total Dias</TableHead>
              <TableHead className="text-right min-w-[100px]">Valor Diária</TableHead>
              <TableHead className="min-w-[150px]">Extras (R$)</TableHead>
              <TableHead className="min-w-[150px]">Obs / Notas</TableHead>
              <TableHead className="text-right min-w-[120px]">Total a Receber</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : workers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-8">
                  Nenhum funcionário ativo.
                </TableCell>
              </TableRow>
            ) : (
              workers.map((worker) => {
                let totalDays = 0
                const extra = extras.find((e) => e.worker_id === worker.id)
                const extraVal = extra?.extra_value || 0

                return (
                  <TableRow key={worker.id}>
                    <TableCell>
                      <div className="font-medium">{worker.name}</div>
                      <div className="text-xs text-muted-foreground">{worker.role}</div>
                    </TableCell>
                    {days.map((d) => {
                      const dateStr = format(d, 'yyyy-MM-dd')
                      const record = records.find(
                        (r) => r.worker_id === worker.id && r.date === dateStr,
                      )
                      const isPresent = record?.is_present || false
                      if (isPresent) totalDays++
                      return (
                        <TableCell key={dateStr} className="text-center">
                          <Checkbox
                            checked={isPresent}
                            onCheckedChange={() => togglePresence(worker.id, dateStr, isPresent)}
                          />
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-center font-bold">{totalDays}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {worker.payment_type === 'monthly'
                        ? 'Mensal'
                        : formatCurrency(worker.daily_cost)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-right"
                        defaultValue={extraVal || ''}
                        onBlur={(e) => handleExtraChange(worker.id, e.target.value, 'extra_value')}
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        defaultValue={extra?.notes || ''}
                        onBlur={(e) => handleExtraChange(worker.id, e.target.value, 'notes')}
                        placeholder="Observações..."
                      />
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {worker.payment_type === 'monthly'
                        ? 'Contrato'
                        : formatCurrency(totalDays * worker.daily_cost + extraVal)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

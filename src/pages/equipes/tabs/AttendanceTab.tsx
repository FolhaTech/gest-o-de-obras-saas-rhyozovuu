import { useState, useEffect, useMemo } from 'react'
import { startOfWeek, addDays, subDays, format } from 'date-fns'
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
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { Equipe, AttendanceRecord, AttendanceExtra } from '@/types'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

export default function AttendanceTab() {
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [workers, setWorkers] = useState<Equipe[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [extras, setExtras] = useState<AttendanceExtra[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 6 }), [selectedDate])

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

  const togglePresence = async (workerId: string, currentStatus: boolean) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const newStatus = !currentStatus

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
    } else {
      toast({
        title: newStatus ? 'Presença confirmada' : 'Falta registrada',
        description: 'Registro salvo com sucesso.',
      })
    }
  }

  const handleExtraChange = async (
    workerId: string,
    value: string,
    field: 'extra_value' | 'notes',
  ) => {
    const startDateStr = format(weekStart, 'yyyy-MM-dd')

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

  const getDayLabel = (date: Date) => format(date, 'EEEE, dd/MM', { locale: ptBR })

  return (
    <div className="space-y-4 bg-card border rounded-md p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
        <div>
          <h2 className="text-lg font-semibold capitalize">{getDayLabel(selectedDate)}</h2>
          <p className="text-sm text-muted-foreground">
            Semana de {format(days[0], 'dd/MM')} a {format(days[6], 'dd/MM')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDate((p) => subDays(p, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            className="w-auto"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={(e) => {
              if (e.target.value) {
                const [year, month, day] = e.target.value.split('-').map(Number)
                setSelectedDate(new Date(year, month - 1, day))
              }
            }}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDate((p) => addDays(p, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <Table className="text-sm min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Nome / Função</TableHead>
              <TableHead className="text-center w-[150px]">
                Presença ({format(selectedDate, 'dd/MM')})
              </TableHead>
              <TableHead className="text-center">Dias na Semana</TableHead>
              <TableHead className="text-right min-w-[100px]">Valor Diária</TableHead>
              <TableHead className="min-w-[120px]">Extra Semanal (R$)</TableHead>
              <TableHead className="min-w-[150px]">Notas da Semana</TableHead>
              <TableHead className="text-right min-w-[120px]">Total a Receber</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : workers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Nenhum funcionário ativo.
                </TableCell>
              </TableRow>
            ) : (
              workers.map((worker) => {
                let totalDays = 0
                days.forEach((d) => {
                  const r = records.find(
                    (r) => r.worker_id === worker.id && r.date === format(d, 'yyyy-MM-dd'),
                  )
                  if (r?.is_present) totalDays++
                })

                const extra = extras.find((e) => e.worker_id === worker.id)
                const extraVal = extra?.extra_value || 0
                const dateStr = format(selectedDate, 'yyyy-MM-dd')
                const todayRecord = records.find(
                  (r) => r.worker_id === worker.id && r.date === dateStr,
                )
                const isPresentToday = todayRecord?.is_present || false

                return (
                  <TableRow key={worker.id}>
                    <TableCell>
                      <div className="font-medium">{worker.name}</div>
                      <div className="text-xs text-muted-foreground">{worker.role}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant={isPresentToday ? 'default' : 'outline'}
                        className={cn(
                          'w-full h-10 text-sm font-bold transition-all duration-200',
                          isPresentToday
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'text-muted-foreground',
                        )}
                        onClick={() => togglePresence(worker.id, isPresentToday)}
                      >
                        {isPresentToday ? (
                          <>
                            <Check className="mr-2 h-4 w-4" /> Presente
                          </>
                        ) : (
                          'Ausente'
                        )}
                      </Button>
                    </TableCell>
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
                        className="h-9 text-right"
                        defaultValue={extraVal || ''}
                        onBlur={(e) => handleExtraChange(worker.id, e.target.value, 'extra_value')}
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-9"
                        defaultValue={extra?.notes || ''}
                        onBlur={(e) => handleExtraChange(worker.id, e.target.value, 'notes')}
                        placeholder="Observações..."
                      />
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {worker.payment_type === 'monthly'
                        ? 'Contrato'
                        : formatCurrency(totalDays * (worker.daily_cost || 0) + extraVal)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-4">
        {loading ? (
          <div className="text-center py-8">Carregando...</div>
        ) : workers.length === 0 ? (
          <div className="text-center py-8">Nenhum funcionário ativo.</div>
        ) : (
          workers.map((worker) => {
            let totalDays = 0
            days.forEach((d) => {
              const r = records.find(
                (r) => r.worker_id === worker.id && r.date === format(d, 'yyyy-MM-dd'),
              )
              if (r?.is_present) totalDays++
            })

            const extra = extras.find((e) => e.worker_id === worker.id)
            const extraVal = extra?.extra_value || 0
            const dateStr = format(selectedDate, 'yyyy-MM-dd')
            const todayRecord = records.find((r) => r.worker_id === worker.id && r.date === dateStr)
            const isPresentToday = todayRecord?.is_present || false
            const totalToReceive =
              worker.payment_type === 'monthly'
                ? 0
                : totalDays * (worker.daily_cost || 0) + extraVal

            return (
              <Card key={worker.id} className="overflow-hidden border-border/50">
                <CardContent className="p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-base">{worker.name}</div>
                      <div className="text-sm text-muted-foreground">{worker.role}</div>
                    </div>
                  </div>

                  <Button
                    variant={isPresentToday ? 'default' : 'outline'}
                    className={cn(
                      'w-full h-14 text-lg font-bold transition-all duration-200 shadow-sm',
                      isPresentToday
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'text-muted-foreground bg-muted/30',
                    )}
                    onClick={() => togglePresence(worker.id, isPresentToday)}
                  >
                    {isPresentToday ? (
                      <>
                        <Check className="mr-2 h-5 w-5" /> PRESENTE
                      </>
                    ) : (
                      'AUSENTE'
                    )}
                  </Button>

                  <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-xs">Dias Trabalhados</div>
                      <div className="font-semibold">{totalDays} dias</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-xs">Valor Diária</div>
                      <div className="font-semibold">
                        {worker.payment_type === 'monthly'
                          ? 'Mensal'
                          : formatCurrency(worker.daily_cost)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <label className="text-xs text-muted-foreground">Extra Semanal (R$)</label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-10 text-right font-medium"
                          defaultValue={extraVal || ''}
                          onBlur={(e) =>
                            handleExtraChange(worker.id, e.target.value, 'extra_value')
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="flex-[2] space-y-1">
                        <label className="text-xs text-muted-foreground">Notas</label>
                        <Input
                          className="h-10"
                          defaultValue={extra?.notes || ''}
                          onBlur={(e) => handleExtraChange(worker.id, e.target.value, 'notes')}
                          placeholder="Obs..."
                        />
                      </div>
                    </div>
                  </div>

                  {worker.payment_type !== 'monthly' && (
                    <div className="flex justify-between items-center pt-3 border-t">
                      <span className="text-sm font-medium">Total na Semana:</span>
                      <span className="text-lg font-bold text-primary">
                        {formatCurrency(totalToReceive)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

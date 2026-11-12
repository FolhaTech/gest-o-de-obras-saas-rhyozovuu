import { Check, ChevronsUpDown, FilterX, SlidersHorizontal } from 'lucide-react'
import { translateStatus } from '@/lib/formatters'
import {
  EMPTY_FILTERS,
  distinctManagers,
  hasAnyFilter,
  type DashboardFilters,
  type PeriodPreset,
} from '@/lib/dashboard-filters'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STATUS_OPTIONS = ['in_progress', 'planned', 'paused', 'delayed', 'finished']

const PERIOD_LABEL: Record<PeriodPreset, string> = {
  all: 'Todo o período',
  month: 'Este mês',
  last_month: 'Mês passado',
  '3m': 'Últimos 3 meses',
  year: 'Este ano',
  custom: 'Personalizado',
}

interface Props {
  obras: { id: string; name: string; manager?: string | null }[]
  filters: DashboardFilters
  onChange: (f: DashboardFilters) => void
  /** Mostra o período (vale para receitas e despesas; só quem vê valores). */
  showPeriod: boolean
  shown: number
}

/** Filtros do Dashboard: casas, situação, responsável e período. */
export default function DashboardFiltersBar({ obras, filters, onChange, showPeriod, shown }: Props) {
  const managers = distinctManagers(obras)
  const set = (patch: Partial<DashboardFilters>) => onChange({ ...filters, ...patch })
  const toggleWork = (id: string, on: boolean) =>
    set({ workIds: on ? [...filters.workIds, id] : filters.workIds.filter((w) => w !== id) })

  const sorted = [...obras].sort((a, b) => a.name.trim().localeCompare(b.name.trim(), 'pt-BR'))
  const workLabel =
    filters.workIds.length === 0
      ? 'Todas as casas'
      : filters.workIds.length === 1
        ? (obras.find((o) => o.id === filters.workIds[0])?.name.trim() ?? '1 casa')
        : `${filters.workIds.length} casas`

  return (
    <Card className="shadow-none">
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground self-center">
            <SlidersHorizontal className="h-4 w-4" /> Filtros
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Casas</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-52 justify-between font-normal">
                  <span className="truncate">{workLabel}</span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {filters.workIds.length === 0 ? 'Todas selecionadas' : `${filters.workIds.length} de ${obras.length}`}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={filters.workIds.length === 0} onClick={() => set({ workIds: [] })}>
                    Limpar
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {sorted.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Nenhuma obra cadastrada.</p>}
                  {sorted.map((o) => {
                    const on = filters.workIds.includes(o.id)
                    return (
                      <label key={o.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                        <Checkbox checked={on} onCheckedChange={(v) => toggleWork(o.id, v === true)} />
                        <span className="truncate flex-1">{o.name.trim()}</span>
                        {on && <Check className="h-3.5 w-3.5 text-primary" />}
                      </label>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Situação</Label>
            <Select value={filters.status} onValueChange={(v) => set({ status: v })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{translateStatus(s)}</SelectItem>)}
                <SelectItem value="risk">Em risco/atraso (prazo vencido)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {managers.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Responsável</Label>
              <Select value={filters.manager} onValueChange={(v) => set({ manager: v })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os responsáveis</SelectItem>
                  {managers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {showPeriod && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Período (receitas e despesas)</Label>
              <Select value={filters.period} onValueChange={(v) => set({ period: v as PeriodPreset })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((p) => <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {showPeriod && filters.period === 'custom' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="dash-from" className="text-xs text-muted-foreground">De</Label>
                <Input id="dash-from" type="date" className="w-40" max={filters.to || undefined} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dash-to" className="text-xs text-muted-foreground">Até</Label>
                <Input id="dash-to" type="date" className="w-40" min={filters.from || undefined} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
              </div>
            </>
          )}

          {hasAnyFilter(filters) && (
            <Button variant="ghost" size="sm" className="gap-1.5 self-end" onClick={() => onChange(EMPTY_FILTERS)}>
              <FilterX className="h-4 w-4" /> Limpar filtros
            </Button>
          )}
        </div>
        {hasAnyFilter(filters) && (
          <p className="text-xs text-muted-foreground">
            Mostrando {shown} de {obras.length} obra(s). Os indicadores abaixo seguem os filtros.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

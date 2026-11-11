import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Fuel, Plus, Trash2, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, formatSupabaseError } from '@/lib/formatters'
import { fuelStats, serviceDue, todayISO } from '@/lib/vehicles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

export const FUEL_TYPES = ['Gasolina', 'Etanol', 'Diesel', 'Flex', 'GNV', 'Elétrico']
const MAINTENANCE_TYPES = [
  'Revisão preventiva',
  'Troca de óleo',
  'Pneus',
  'Freios',
  'Suspensão',
  'Elétrica',
  'Funilaria / pintura',
  'Corretiva',
  'Outra',
]

interface Maintenance {
  id: string
  maintenance_date: string
  maintenance_type: string | null
  description: string | null
  odometer_km: number | null
  performed_by: string | null
  maintenance_cost?: number | null
  next_due_date: string | null
  next_due_km: number | null
}
interface Fuel {
  id: string
  receipt_date: string
  station: string | null
  fuel_type: string | null
  liters: number
  price_per_liter?: number | null
  total_value?: number | null
  odometer_km: number | null
  invoice_number: string | null
  receipt_url: string | null
  notes: string | null
}
interface VehicleRow {
  id: string
  plate: string
  brand: string | null
  model: string
  year: number | null
  odometer_km: number
  fuel_type: string | null
}

const emptyMaint = () => ({
  maintenance_date: todayISO(),
  maintenance_type: MAINTENANCE_TYPES[0],
  description: '',
  odometer_km: '',
  performed_by: '',
  maintenance_cost: '',
  next_due_date: '',
  next_due_km: '',
})
const emptyFuel = (fuel: string | null) => ({
  receipt_date: todayISO(),
  station: '',
  fuel_type: fuel || FUEL_TYPES[0],
  liters: '',
  price_per_liter: '',
  total_value: '',
  odometer_km: '',
  invoice_number: '',
  notes: '',
})

const num = (v: string) => Number((v || '0').replace(',', '.'))
const intOrNull = (v: string) => (v.trim() === '' ? null : Math.round(num(v)))

/** Manutenções e notas fiscais de combustível de um veículo. */
export default function VehicleDetail({
  vehicleId,
  onClose,
  onChanged,
}: {
  vehicleId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const { canSeeValues } = useAuth()
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null)
  const [maints, setMaints] = useState<Maintenance[]>([])
  const [fuels, setFuels] = useState<Fuel[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [maintOpen, setMaintOpen] = useState(false)
  const [maintForm, setMaintForm] = useState(emptyMaint())
  const [fuelOpen, setFuelOpen] = useState(false)
  const [fuelForm, setFuelForm] = useState(emptyFuel(null))
  const [file, setFile] = useState<File | null>(null)

  const today = todayISO()

  const load = useCallback(async () => {
    if (!vehicleId) return
    setLoading(true)
    const [v, m, f] = await Promise.all([
      supabase.from('vehicles' as any).select('id, plate, brand, model, year, odometer_km, fuel_type').eq('id', vehicleId).single(),
      supabase.from('vehicle_maintenances' as any).select('*').eq('vehicle_id', vehicleId).order('maintenance_date', { ascending: false }),
      supabase.from('vehicle_fuel_receipts' as any).select('*').eq('vehicle_id', vehicleId).order('receipt_date', { ascending: false }),
    ])
    setVehicle((v.data as unknown as VehicleRow) ?? null)
    setMaints((m.data as unknown as Maintenance[]) ?? [])
    setFuels((f.data as unknown as Fuel[]) ?? [])
    setLoading(false)
  }, [vehicleId])

  useEffect(() => {
    setVehicle(null)
    setMaints([])
    setFuels([])
    load()
  }, [load])

  const svc = useMemo(() => serviceDue(maints, vehicle?.odometer_km ?? 0, today), [maints, vehicle, today])
  const stats = useMemo(() => fuelStats(fuels), [fuels])

  /** Km menor que o atual costuma ser erro de digitação: pede confirmação. */
  const kmOk = (km: number | null) =>
    km === null ||
    !vehicle ||
    km >= vehicle.odometer_km ||
    confirm(`O km informado (${km}) é menor que o km atual do veículo (${vehicle.odometer_km}). Salvar mesmo assim?`)

  const saveMaintenance = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!vehicle) return
    const km = intOrNull(maintForm.odometer_km)
    const nextKm = intOrNull(maintForm.next_due_km)
    const cost = num(maintForm.maintenance_cost)
    if (!maintForm.maintenance_date || Number.isNaN(cost) || cost < 0 || (km !== null && km < 0) || (nextKm !== null && nextKm < 0)) {
      toast({ title: 'Confira os dados', description: 'Informe a data e valores válidos.', variant: 'destructive' })
      return
    }
    if (maintForm.maintenance_date > today) {
      toast({ title: 'Data inválida', description: 'A manutenção não pode estar no futuro.', variant: 'destructive' })
      return
    }
    if (maintForm.next_due_date && maintForm.next_due_date < maintForm.maintenance_date) {
      toast({ title: 'Datas inválidas', description: 'A próxima revisão não pode ser anterior à manutenção.', variant: 'destructive' })
      return
    }
    if (!kmOk(km)) return
    const payload: Record<string, unknown> = {
      vehicle_id: vehicle.id,
      maintenance_date: maintForm.maintenance_date,
      maintenance_type: maintForm.maintenance_type || null,
      description: maintForm.description.trim() || null,
      odometer_km: km,
      performed_by: maintForm.performed_by.trim() || null,
      next_due_date: maintForm.next_due_date || null,
      next_due_km: nextKm,
    }
    if (canSeeValues) payload.maintenance_cost = cost
    setSaving(true)
    const { error } = await supabase.from('vehicle_maintenances' as any).insert(payload)
    setSaving(false)
    if (error) {
      toast({ title: 'Erro ao registrar', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Manutenção registrada' })
    setMaintOpen(false)
    await load()
    onChanged()
  }

  const saveFuel = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!vehicle) return
    const liters = num(fuelForm.liters)
    const km = intOrNull(fuelForm.odometer_km)
    let price = num(fuelForm.price_per_liter)
    let total = num(fuelForm.total_value)
    if (!fuelForm.receipt_date || !(liters > 0) || Number.isNaN(price) || Number.isNaN(total) || price < 0 || total < 0 || (km !== null && km < 0)) {
      toast({ title: 'Confira os dados', description: 'Informe a data, os litros (maior que zero) e valores válidos.', variant: 'destructive' })
      return
    }
    if (fuelForm.receipt_date > today) {
      toast({ title: 'Data inválida', description: 'O abastecimento não pode estar no futuro.', variant: 'destructive' })
      return
    }
    if (file && file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo grande demais', description: 'Envie a nota com até 10 MB.', variant: 'destructive' })
      return
    }
    if (!kmOk(km)) return
    // preenche o que faltar: total = litros × preço, preço = total ÷ litros
    if (total > 0 && price === 0) price = Math.round((total / liters) * 1000) / 1000
    if (price > 0 && total === 0) total = Math.round(price * liters * 100) / 100

    setSaving(true)
    let receiptUrl: string | null = null
    if (file) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `vehicles/${vehicle.id}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from('receipts').upload(path, file)
      if (up.error) {
        setSaving(false)
        toast({ title: 'Erro ao enviar a nota', description: up.error.message, variant: 'destructive' })
        return
      }
      receiptUrl = supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl
    }
    const payload: Record<string, unknown> = {
      vehicle_id: vehicle.id,
      receipt_date: fuelForm.receipt_date,
      station: fuelForm.station.trim() || null,
      fuel_type: fuelForm.fuel_type || null,
      liters,
      odometer_km: km,
      invoice_number: fuelForm.invoice_number.trim() || null,
      receipt_url: receiptUrl,
      notes: fuelForm.notes.trim() || null,
    }
    if (canSeeValues) {
      payload.price_per_liter = price
      payload.total_value = total
    }
    const { error } = await supabase.from('vehicle_fuel_receipts' as any).insert(payload)
    setSaving(false)
    if (error) {
      toast({ title: 'Erro ao registrar', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    toast({ title: 'Abastecimento registrado' })
    setFuelOpen(false)
    setFile(null)
    await load()
    onChanged()
  }

  const remove = async (table: 'vehicle_maintenances' | 'vehicle_fuel_receipts', id: string, what: string) => {
    if (!confirm(`Excluir ${what}?`)) return
    const { error } = await supabase.from(table as any).delete().eq('id', id)
    if (error) {
      toast({ title: 'Erro ao excluir', description: formatSupabaseError(error), variant: 'destructive' })
      return
    }
    await load()
    onChanged()
  }

  const fmtNum = (n: number, d = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

  return (
    <>
      <Dialog open={!!vehicleId} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {vehicle ? `${vehicle.plate} · ${[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}${vehicle.year ? ` ${vehicle.year}` : ''}` : 'Veículo'}
            </DialogTitle>
            <DialogDescription>Manutenções e notas fiscais de combustível.</DialogDescription>
          </DialogHeader>

          {loading && !vehicle ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Km atual</div>
                  <div className="text-lg font-semibold">{fmtNum(vehicle?.odometer_km ?? 0)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Próxima revisão</div>
                  <div className={`text-sm font-semibold ${svc.state === 'overdue' ? 'text-rose-600' : svc.state === 'soon' ? 'text-amber-600' : ''}`}>
                    {svc.state === 'none' ? '-' : [svc.nextDate ? formatDate(svc.nextDate) : null, svc.nextKm !== null ? `${fmtNum(svc.nextKm)} km` : null].filter(Boolean).join(' / ')}
                  </div>
                  {svc.state !== 'none' && (
                    <div className="text-[10px] text-muted-foreground">
                      {svc.state === 'overdue' ? 'vencida' : [svc.daysLeft !== null ? `faltam ${svc.daysLeft} dia(s)` : null, svc.kmLeft !== null ? `faltam ${fmtNum(svc.kmLeft)} km` : null].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Consumo médio</div>
                  <div className="text-lg font-semibold">{stats.kmPerLiter ? `${fmtNum(stats.kmPerLiter, 1)} km/L` : '-'}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{canSeeValues ? 'Gasto com combustível' : 'Litros abastecidos'}</div>
                  <div className="text-lg font-semibold">{canSeeValues ? formatCurrency(stats.spent) : `${fmtNum(stats.liters, 1)} L`}</div>
                </div>
              </div>

              <Tabs defaultValue="maint" className="w-full">
                <TabsList>
                  <TabsTrigger value="maint" className="gap-1.5">
                    <Wrench className="h-3.5 w-3.5" /> Manutenções ({maints.length})
                  </TabsTrigger>
                  <TabsTrigger value="fuel" className="gap-1.5">
                    <Fuel className="h-3.5 w-3.5" /> Combustível ({fuels.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="maint" className="space-y-3">
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" onClick={() => { setMaintForm(emptyMaint()); setMaintOpen(true) }}>
                      <Plus className="h-4 w-4" /> Registrar manutenção
                    </Button>
                  </div>
                  {maints.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma manutenção registrada.</p>
                  ) : (
                    <div className="divide-y rounded-md border">
                      {maints.map((m) => (
                        <div key={m.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                          <div className="space-y-0.5">
                            <div className="font-medium flex items-center gap-2 flex-wrap">
                              {formatDate(m.maintenance_date)}
                              {m.maintenance_type && <Badge variant="secondary" className="font-normal">{m.maintenance_type}</Badge>}
                            </div>
                            {m.description && <div>{m.description}</div>}
                            <div className="text-xs text-muted-foreground">
                              {[
                                m.odometer_km !== null ? `${fmtNum(m.odometer_km)} km` : null,
                                m.performed_by,
                                canSeeValues && m.maintenance_cost ? formatCurrency(Number(m.maintenance_cost)) : null,
                                m.next_due_date || m.next_due_km !== null
                                  ? `próxima: ${[m.next_due_date ? formatDate(m.next_due_date) : null, m.next_due_km !== null ? `${fmtNum(m.next_due_km)} km` : null].filter(Boolean).join(' / ')}`
                                  : null,
                              ].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive shrink-0" title="Excluir" onClick={() => remove('vehicle_maintenances', m.id, 'esta manutenção')}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="fuel" className="space-y-3">
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" onClick={() => { setFuelForm(emptyFuel(vehicle?.fuel_type ?? null)); setFile(null); setFuelOpen(true) }}>
                      <Plus className="h-4 w-4" /> Registrar abastecimento
                    </Button>
                  </div>
                  {fuels.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma nota de combustível registrada.</p>
                  ) : (
                    <div className="divide-y rounded-md border">
                      {fuels.map((f) => (
                        <div key={f.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                          <div className="space-y-0.5">
                            <div className="font-medium flex items-center gap-2 flex-wrap">
                              {formatDate(f.receipt_date)}
                              <span>{fmtNum(Number(f.liters), 2)} L</span>
                              {f.fuel_type && <Badge variant="secondary" className="font-normal">{f.fuel_type}</Badge>}
                              {canSeeValues && Number(f.total_value) > 0 && <span className="text-primary">{formatCurrency(Number(f.total_value))}</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {[
                                f.station,
                                f.invoice_number ? `NF ${f.invoice_number}` : null,
                                f.odometer_km !== null ? `${fmtNum(f.odometer_km)} km` : null,
                                canSeeValues && Number(f.price_per_liter) > 0 ? `${formatCurrency(Number(f.price_per_liter))}/L` : null,
                              ].filter(Boolean).join(' · ')}
                            </div>
                            {f.notes && <div className="text-xs">{f.notes}</div>}
                            {f.receipt_url && (
                              <a href={f.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Ver nota
                              </a>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive shrink-0" title="Excluir" onClick={() => remove('vehicle_fuel_receipts', f.id, 'esta nota de combustível')}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Registrar manutenção */}
      <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar manutenção</DialogTitle>
            <DialogDescription>{vehicle?.plate}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveMaintenance} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vm-date">Data *</Label>
                <Input id="vm-date" type="date" required max={today} value={maintForm.maintenance_date} onChange={(e) => setMaintForm({ ...maintForm, maintenance_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={maintForm.maintenance_type} onValueChange={(v) => setMaintForm({ ...maintForm, maintenance_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vm-desc">O que foi feito</Label>
              <Textarea id="vm-desc" rows={2} value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} />
            </div>
            <div className={`grid gap-4 ${canSeeValues ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="space-y-2">
                <Label htmlFor="vm-km">Km no dia</Label>
                <Input id="vm-km" type="number" min="0" step="1" value={maintForm.odometer_km} onChange={(e) => setMaintForm({ ...maintForm, odometer_km: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vm-by">Oficina / mecânico</Label>
                <Input id="vm-by" value={maintForm.performed_by} onChange={(e) => setMaintForm({ ...maintForm, performed_by: e.target.value })} />
              </div>
              {canSeeValues && (
                <div className="space-y-2">
                  <Label htmlFor="vm-cost">Custo (R$)</Label>
                  <Input id="vm-cost" inputMode="decimal" placeholder="0,00" value={maintForm.maintenance_cost} onChange={(e) => setMaintForm({ ...maintForm, maintenance_cost: e.target.value })} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vm-nd">Próxima revisão em (data)</Label>
                <Input id="vm-nd" type="date" min={maintForm.maintenance_date} value={maintForm.next_due_date} onChange={(e) => setMaintForm({ ...maintForm, next_due_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vm-nk">Próxima revisão em (km)</Label>
                <Input id="vm-nk" type="number" min="0" step="1" value={maintForm.next_due_km} onChange={(e) => setMaintForm({ ...maintForm, next_due_km: e.target.value })} />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setMaintOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registrar abastecimento / nota fiscal */}
      <Dialog open={fuelOpen} onOpenChange={setFuelOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar abastecimento</DialogTitle>
            <DialogDescription>{vehicle?.plate} · nota fiscal de combustível</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveFuel} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vf-date">Data *</Label>
                <Input id="vf-date" type="date" required max={today} value={fuelForm.receipt_date} onChange={(e) => setFuelForm({ ...fuelForm, receipt_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Combustível</Label>
                <Select value={fuelForm.fuel_type} onValueChange={(v) => setFuelForm({ ...fuelForm, fuel_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vf-station">Posto</Label>
                <Input id="vf-station" value={fuelForm.station} onChange={(e) => setFuelForm({ ...fuelForm, station: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vf-nf">Nº da nota fiscal</Label>
                <Input id="vf-nf" value={fuelForm.invoice_number} onChange={(e) => setFuelForm({ ...fuelForm, invoice_number: e.target.value })} />
              </div>
            </div>
            <div className={`grid gap-4 ${canSeeValues ? 'grid-cols-4' : 'grid-cols-2'}`}>
              <div className="space-y-2">
                <Label htmlFor="vf-l">Litros *</Label>
                <Input id="vf-l" inputMode="decimal" required placeholder="0,00" value={fuelForm.liters} onChange={(e) => setFuelForm({ ...fuelForm, liters: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vf-km">Km do veículo</Label>
                <Input id="vf-km" type="number" min="0" step="1" value={fuelForm.odometer_km} onChange={(e) => setFuelForm({ ...fuelForm, odometer_km: e.target.value })} />
              </div>
              {canSeeValues && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="vf-p">Preço do litro</Label>
                    <Input id="vf-p" inputMode="decimal" placeholder="0,000" value={fuelForm.price_per_liter} onChange={(e) => setFuelForm({ ...fuelForm, price_per_liter: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vf-t">Valor total (R$)</Label>
                    <Input id="vf-t" inputMode="decimal" placeholder="0,00" value={fuelForm.total_value} onChange={(e) => setFuelForm({ ...fuelForm, total_value: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            {canSeeValues ? (
              <p className="text-xs text-muted-foreground">Informe o preço do litro ou o valor total: o outro é calculado.</p>
            ) : (
              <p className="text-xs text-muted-foreground">O valor da nota é preenchido pelo administrador.</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="vf-file">Foto ou PDF da nota (até 10 MB)</Label>
              <Input id="vf-file" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vf-notes">Observações</Label>
              <Textarea id="vf-notes" rows={2} value={fuelForm.notes} onChange={(e) => setFuelForm({ ...fuelForm, notes: e.target.value })} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setFuelOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

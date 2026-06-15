import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'

interface Props {
  obraId: string
  totalArea: number
  catalogMaterials: any[]
  existingMaterialIds: string[]
  onSuccess: () => void
}

export function CatalogSelectionDialog({
  obraId,
  totalArea,
  catalogMaterials,
  existingMaterialIds,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [consumptions, setConsumptions] = useState<Record<string, string>>({})
  const { toast } = useToast()

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setSearch('')
      setSelectedIds(new Set())
      setConsumptions({})
    }
  }

  const handleLink = async () => {
    if (selectedIds.size === 0) return

    const inserts = Array.from(selectedIds).map((id) => {
      const consumption = Number(consumptions[id]) || 0
      const quantity = totalArea > 0 && consumption > 0 ? consumption * totalArea : 1

      return {
        work_id: obraId,
        material_id: id,
        quantity,
        consumption_per_m2: consumption > 0 ? consumption : null,
        notes: 'Vinculado do catálogo',
      }
    })

    const { error } = await supabase.from('work_extra_materials').insert(inserts)

    if (!error) {
      toast({ title: 'Materiais vinculados com sucesso!' })
      handleOpenChange(false)
      onSuccess()
    } else {
      toast({ title: 'Erro ao vincular', description: error.message, variant: 'destructive' })
    }
  }

  const handleConsumptionChange = (id: string, value: string) => {
    setConsumptions((prev) => ({ ...prev, [id]: value }))
  }

  const filtered = catalogMaterials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Plus className="h-4 w-4" /> Vincular do Catálogo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Catálogo Global de Materiais</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {!totalArea && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                A área total desta obra não está definida. Defina a área total na aba "Visão Geral"
                para que o cálculo automático de consumo funcione corretamente.
              </AlertDescription>
            </Alert>
          )}

          <Input
            placeholder="Buscar no catálogo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ScrollArea className="h-[400px] border rounded-md p-4">
            <div className="space-y-4">
              {filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground mt-10">
                  Nenhum material encontrado.
                </p>
              ) : (
                filtered.map((m) => {
                  const isLinked = existingMaterialIds.includes(m.id)
                  const isSelected = selectedIds.has(m.id)
                  const consValue = Number(consumptions[m.id]) || 0

                  return (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between p-2 rounded-lg ${isSelected ? 'bg-muted/50' : ''}`}
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`cat-${m.id}`}
                          disabled={isLinked}
                          checked={isLinked || isSelected}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedIds)
                            if (checked) next.add(m.id)
                            else {
                              next.delete(m.id)
                              const newCons = { ...consumptions }
                              delete newCons[m.id]
                              setConsumptions(newCons)
                            }
                            setSelectedIds(next)
                          }}
                        />
                        <label
                          htmlFor={`cat-${m.id}`}
                          className={`text-sm font-medium leading-none ${isLinked ? 'text-muted-foreground' : 'cursor-pointer'}`}
                        >
                          {m.name} {m.unit_of_measure ? `(${m.unit_of_measure})` : ''}{' '}
                          {isLinked && '(Já vinculado)'}
                        </label>
                      </div>

                      {isSelected && !isLinked && (
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`cons-${m.id}`} className="text-xs whitespace-nowrap">
                              Consumo por m²
                            </Label>
                            <Input
                              id={`cons-${m.id}`}
                              type="number"
                              min="0"
                              step="0.0001"
                              className="w-24 h-8 text-right"
                              value={consumptions[m.id] || ''}
                              onChange={(e) => handleConsumptionChange(m.id, e.target.value)}
                              placeholder="0.00"
                            />
                          </div>

                          <div className="w-24 text-right">
                            <Label className="text-xs text-muted-foreground block mb-1">
                              Qtd Total
                            </Label>
                            <span className="text-sm font-medium">
                              {consValue > 0 && totalArea > 0
                                ? (consValue * totalArea).toFixed(2)
                                : '1.00'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </ScrollArea>
          <Button className="w-full" onClick={handleLink} disabled={selectedIds.size === 0}>
            Vincular Selecionados ({selectedIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

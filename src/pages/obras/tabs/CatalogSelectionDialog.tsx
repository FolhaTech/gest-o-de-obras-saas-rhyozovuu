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
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface Props {
  obraId: string
  catalogMaterials: any[]
  existingMaterialIds: string[]
  onSuccess: () => void
}

export function CatalogSelectionDialog({
  obraId,
  catalogMaterials,
  existingMaterialIds,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setSearch('')
      setSelectedIds(new Set())
    }
  }

  const handleLink = async () => {
    if (selectedIds.size === 0) return

    const inserts = Array.from(selectedIds).map((id) => ({
      work_id: obraId,
      material_id: id,
      quantity: 1, // Default quantity when imported from catalog
      notes: 'Vinculado do catálogo',
    }))

    const { error } = await supabase.from('work_extra_materials').insert(inserts)

    if (!error) {
      toast({ title: 'Materiais vinculados com sucesso!' })
      handleOpenChange(false)
      onSuccess()
    } else {
      toast({ title: 'Erro ao vincular', description: error.message, variant: 'destructive' })
    }
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Catálogo Global de Materiais</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <Input
            placeholder="Buscar no catálogo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ScrollArea className="h-[300px] border rounded-md p-4">
            <div className="space-y-4">
              {filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground mt-10">
                  Nenhum material encontrado.
                </p>
              ) : (
                filtered.map((m) => {
                  const isLinked = existingMaterialIds.includes(m.id)
                  return (
                    <div key={m.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`cat-${m.id}`}
                        disabled={isLinked}
                        checked={isLinked || selectedIds.has(m.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds)
                          if (checked) next.add(m.id)
                          else next.delete(m.id)
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

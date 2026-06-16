import { useState, useEffect } from 'react'
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
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Trash, Plus, Sparkles, Loader2, Info, Eye } from 'lucide-react'
import { ConversaoUnidadesService } from '@/lib/conversao-unidades'

function CompositionDetails({ wsId }: { wsId: string }) {
  const [comps, setComps] = useState<any[]>([])
  const [open, setOpen] = useState(false)

  const loadComps = async () => {
    const { data } = await supabase
      .from('compositions_history')
      .select('*, materials(name, unidade_nativa)')
      .eq('work_service_id', wsId)
    setComps(data || [])
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val)
        if (val) loadComps()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8">
          <Eye className="h-4 w-4 mr-2" />
          Ver Composição
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Materiais Alocados (Composição)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {comps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma composição encontrada.
            </p>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Perda</TableHead>
                    <TableHead className="text-right">Quantidade (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comps.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.materials?.name}</TableCell>
                      <TableCell className="text-right">{c.waste_percentage}%</TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        {Number(c.coefficient).toFixed(2)} {c.materials?.unidade_nativa || 'kg'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function WorkServicesTab({ obraId }: { obraId: string }) {
  const [services, setServices] = useState<any[]>([])
  const [catalog, setCatalog] = useState<any[]>([])
  const [dbMaterials, setDbMaterials] = useState<any[]>([])
  const [densities, setDensities] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [selectedService, setSelectedService] = useState('')
  const [quantity, setQuantity] = useState('')

  // Custom Service with AI
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customUnit, setCustomUnit] = useState('m2')
  const [aiMaterials, setAiMaterials] = useState<any[]>([])
  const [generatingAI, setGeneratingAI] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    const [wsRes, catRes, matRes, densRes] = await Promise.all([
      supabase.from('work_services').select('*, services(name, unit)').eq('work_id', obraId),
      supabase.from('services').select('*'),
      supabase.from('materials').select('*'),
      supabase.from('densidades_insumo').select('*'),
    ])
    setServices(wsRes.data || [])
    setCatalog(catRes.data || [])
    setDbMaterials(matRes.data || [])

    const dMap: Record<string, any> = {}
    densRes.data?.forEach((d) => {
      if (d.material_id) dMap[d.material_id] = d
    })
    setDensities(dMap)

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [obraId])

  const handleGenerateAI = async () => {
    if (!customName) {
      toast({ title: 'Aviso', description: 'Informe o nome do serviço', variant: 'destructive' })
      return
    }
    setGeneratingAI(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-composition', {
        body: { serviceName: customName, unit: customUnit },
      })
      if (error) throw error

      const matched = data.materials.map((m: any) => {
        const mName = m.name.toLowerCase()
        const match = dbMaterials.find(
          (dbm) =>
            dbm.name.toLowerCase() === mName ||
            dbm.name.toLowerCase().includes(mName) ||
            mName.includes(dbm.name.toLowerCase()),
        )
        return {
          ...m,
          matchedMaterialId: match ? match.id : '',
        }
      })

      setAiMaterials(matched)
      toast({ title: 'Materiais gerados com sucesso!' })
    } catch (e: any) {
      toast({ title: 'Erro na IA', description: e.message, variant: 'destructive' })
    } finally {
      setGeneratingAI(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quantity) return

    let finalServiceId = selectedService

    if (isCustomMode) {
      if (!customName || !customUnit) return
      if (aiMaterials.some((m) => !m.matchedMaterialId)) {
        toast({
          title: 'Aviso',
          description: 'Mapeie todos os materiais gerados para o catálogo.',
          variant: 'destructive',
        })
        return
      }

      // 1. Check if custom service name already exists to avoid unique constraint error
      let { data: existingSvc } = await supabase
        .from('services')
        .select('id')
        .eq('name', customName)
        .maybeSingle()

      if (!existingSvc) {
        const { data: svcData, error: svcErr } = await supabase
          .from('services')
          .insert({
            name: customName,
            unit: customUnit,
          })
          .select()
          .single()

        if (svcErr) {
          toast({
            title: 'Erro ao criar serviço',
            description: svcErr.message,
            variant: 'destructive',
          })
          return
        }
        existingSvc = svcData
      }

      finalServiceId = existingSvc.id

      // 2. Create compositions
      const compsToInsert = aiMaterials.map((m) => {
        const densityData = densities[m.matchedMaterialId]
        const convertedCoeff = ConversaoUnidadesService.converterParaKg(
          m.coefficient,
          m.unit,
          densityData?.densidade_kg_m3,
          densityData?.peso_unitario_kg,
        )

        return {
          service_id: finalServiceId,
          material_id: m.matchedMaterialId,
          coefficient: convertedCoeff,
          waste_percentage: m.waste_percentage,
        }
      })

      // Delete old comps first if re-using name
      await supabase.from('compositions').delete().eq('service_id', finalServiceId)

      const { error: compErr } = await supabase.from('compositions').insert(compsToInsert)
      if (compErr) {
        toast({
          title: 'Erro ao salvar composições',
          description: compErr.message,
          variant: 'destructive',
        })
        return
      }
    } else {
      if (!finalServiceId) return
    }

    const { error } = await supabase.from('work_services').insert({
      work_id: obraId,
      service_id: finalServiceId,
      target_quantity: Number(quantity),
      status: 'planned',
    })

    if (!error) {
      toast({ title: 'Serviço adicionado à obra!' })
      setOpen(false)
      setSelectedService('')
      setQuantity('')
      setIsCustomMode(false)
      setCustomName('')
      setCustomUnit('m2')
      setAiMaterials([])
      fetchData()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja remover este serviço? O histórico de materiais dele também será apagado.'))
      return
    await supabase.from('work_services').delete().eq('id', id)
    fetchData()
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Serviços Planejados</h3>
          <p className="text-sm text-muted-foreground">
            Adicione serviços para calcular automaticamente as receitas de insumos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar Serviço
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Adicionar Serviço</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div className="flex items-center gap-2 mb-4 p-3 border rounded-md bg-muted/50">
                <Switch checked={isCustomMode} onCheckedChange={setIsCustomMode} id="custom-mode" />
                <Label htmlFor="custom-mode" className="cursor-pointer font-medium">
                  Criar Serviço Customizado com IA
                </Label>
              </div>

              {isCustomMode ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label>Nome do Serviço</Label>
                      <Input
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Ex: Parede Decorativa Customizada"
                        required={isCustomMode}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unidade</Label>
                      <Input
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="Ex: m2"
                        required={isCustomMode}
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full gap-2 border-blue-200 hover:bg-blue-50 text-blue-700 transition-colors"
                    onClick={handleGenerateAI}
                    disabled={generatingAI}
                  >
                    {generatingAI ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Gerar Materiais com IA
                  </Button>

                  {aiMaterials.length > 0 && (
                    <div className="space-y-3 mt-4 border rounded-md p-4 bg-card">
                      <h4 className="font-medium flex items-center gap-2 text-sm">
                        <Info className="h-4 w-4 text-muted-foreground" />
                        Composição Sugerida (Mapeie para o Catálogo)
                      </h4>
                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                        {aiMaterials.map((aim, idx) => {
                          const densityData = densities[aim.matchedMaterialId]
                          const convertedCoeff = aim.matchedMaterialId
                            ? ConversaoUnidadesService.converterParaKg(
                                aim.coefficient,
                                aim.unit,
                                densityData?.densidade_kg_m3,
                                densityData?.peso_unitario_kg,
                              )
                            : null

                          return (
                            <div
                              key={idx}
                              className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-md text-sm items-center bg-muted/30"
                            >
                              <div>
                                <p className="font-medium text-foreground">{aim.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  IA Sugere: {aim.coefficient} {aim.unit} (+{aim.waste_percentage}%
                                  perda)
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Select
                                  value={aim.matchedMaterialId}
                                  onValueChange={(val) => {
                                    const newArr = [...aiMaterials]
                                    newArr[idx].matchedMaterialId = val
                                    setAiMaterials(newArr)
                                  }}
                                >
                                  <SelectTrigger className="h-8 bg-background">
                                    <SelectValue placeholder="Selecionar Material..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {dbMaterials.map((dbm) => (
                                      <SelectItem key={dbm.id} value={dbm.id}>
                                        {dbm.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {convertedCoeff !== null && (
                                  <p className="text-xs text-right text-emerald-600 font-medium">
                                    Quantidade (kg): {convertedCoeff.toFixed(2)} kg
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 animate-fade-in">
                  <Label>Serviço (Catálogo)</Label>
                  <Select
                    value={selectedService}
                    onValueChange={setSelectedService}
                    required={!isCustomMode}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o serviço..." />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Label>
                  Quantidade Planejada (
                  {isCustomMode
                    ? customUnit
                    : catalog.find((c) => c.id === selectedService)?.unit || ''}
                  )
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full">
                {isCustomMode ? 'Salvar Serviço e Composição' : 'Adicionar Serviço'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">Qtd Planejada</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Composição</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.services?.name}</TableCell>
                <TableCell>{s.services?.unit}</TableCell>
                <TableCell className="text-right">{s.target_quantity}</TableCell>
                <TableCell className="text-center">{s.status}</TableCell>
                <TableCell className="text-center">
                  <CompositionDetails wsId={s.id} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {services.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                  Nenhum serviço lançado nesta obra.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

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
      .select('*, materials(name, unidade_nativa, stock_quantity)')
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
                    <TableHead className="text-right">Coeficiente</TableHead>
                    <TableHead className="text-right">Estoque Atual</TableHead>
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
                      <TableCell className="text-right text-muted-foreground">
                        {Number(c.materials?.stock_quantity || 0).toFixed(2)}{' '}
                        {c.materials?.unidade_nativa || 'kg'}
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
  const [openCustom, setOpenCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customUnit, setCustomUnit] = useState('m2')
  const [customQuantity, setCustomQuantity] = useState('')
  const [aiMaterials, setAiMaterials] = useState<any[]>([])
  const [generatingAI, setGeneratingAI] = useState(false)

  const [selectedServiceComps, setSelectedServiceComps] = useState<any[]>([])

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

  useEffect(() => {
    if (selectedService) {
      supabase
        .from('compositions')
        .select('*, materials(*)')
        .eq('service_id', selectedService)
        .then(({ data }) => setSelectedServiceComps(data || []))
    } else {
      setSelectedServiceComps([])
    }
  }, [selectedService])

  const validateMaterialStock = (material: any, requiredQtyNative: number) => {
    if (!material) return { valid: true, stockNative: 0, unit: 'kg' }

    const densityData = densities[material.id]
    const requiredKg = ConversaoUnidadesService.converterParaKg(
      requiredQtyNative,
      material.unidade_nativa || 'kg',
      densityData?.densidade_kg_m3,
      densityData?.peso_unitario_kg,
    )

    const stockNative = material.stock_quantity || 0
    const stockKg = ConversaoUnidadesService.converterParaKg(
      stockNative,
      material.unidade_nativa || 'kg',
      densityData?.densidade_kg_m3,
      densityData?.peso_unitario_kg,
    )

    return {
      valid: requiredKg <= stockKg + 0.001,
      requiredKg,
      stockKg,
      stockNative,
      unit: material.unidade_nativa || 'kg',
    }
  }

  const checkCatalogValidation = () => {
    const qty = Number(quantity) || 0
    if (qty <= 0) return []
    const errors: string[] = []
    for (const comp of selectedServiceComps) {
      const mat = comp.materials
      if (!mat) continue
      const reqNative = comp.coefficient * (1 + (comp.waste_percentage || 0) / 100) * qty
      const { valid, stockNative, unit } = validateMaterialStock(mat, reqNative)
      if (!valid) {
        errors.push(
          `Quantidade excede o estoque disponível para ${mat.name}. Disponível: ${Number(stockNative).toFixed(2)} [${unit}], Solicitado: ${reqNative.toFixed(2)} [${unit}]`,
        )
      }
    }
    return errors
  }

  const checkCustomValidation = () => {
    const qty = Number(customQuantity) || 0
    if (qty <= 0) return []
    const errors: string[] = []
    for (const aim of aiMaterials) {
      const reqNative = aim.coefficient * (1 + (aim.waste_percentage || 0) / 100) * qty
      let mat = dbMaterials.find((m) => m.id === aim.matchedMaterialId)
      if (!mat) {
        mat = { id: 'new', name: aim.name, unidade_nativa: aim.unit || 'kg', stock_quantity: 0 }
      }
      const { valid, stockNative, unit } = validateMaterialStock(mat, reqNative)
      if (!valid) {
        errors.push(
          `Quantidade excede o estoque disponível para ${mat.name}. Disponível: ${Number(stockNative).toFixed(2)} [${unit}], Solicitado: ${reqNative.toFixed(2)} [${unit}]`,
        )
      }
    }
    return errors
  }

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
          matchedMaterialId: match ? match.id : 'new',
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
    if (!quantity || !selectedService) return

    const errors = checkCatalogValidation()
    if (errors.length > 0) {
      toast({ title: 'Estoque Insuficiente', description: errors[0], variant: 'destructive' })
      return
    }

    const { error } = await supabase.from('work_services').insert({
      work_id: obraId,
      service_id: selectedService,
      target_quantity: Number(quantity),
      status: 'planned',
    })

    if (!error) {
      toast({ title: 'Serviço adicionado à obra!' })
      setOpen(false)
      setSelectedService('')
      setQuantity('')
      fetchData()
    } else {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    }
  }

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customName || !customUnit || !customQuantity) return
    if (aiMaterials.length === 0) {
      toast({ title: 'Aviso', description: 'Gere os materiais primeiro.', variant: 'destructive' })
      return
    }

    const errors = checkCustomValidation()
    if (errors.length > 0) {
      toast({ title: 'Estoque Insuficiente', description: errors[0], variant: 'destructive' })
      return
    }

    try {
      let { data: existingSvc } = await supabase
        .from('services')
        .select('id')
        .ilike('name', customName)
        .maybeSingle()

      if (!existingSvc) {
        const { data: svcData, error: svcErr } = await supabase
          .from('services')
          .insert({ name: customName, unit: customUnit })
          .select()
          .single()
        if (svcErr) throw svcErr
        existingSvc = svcData
      }

      const finalServiceId = existingSvc.id
      await supabase.from('compositions').delete().eq('service_id', finalServiceId)

      const compsToInsert = []
      for (const m of aiMaterials) {
        let matId = m.matchedMaterialId
        if (matId === 'new') {
          let { data: existingMat } = await supabase
            .from('materials')
            .select('id')
            .ilike('name', m.name)
            .maybeSingle()

          if (existingMat) {
            matId = existingMat.id
          } else {
            const { data: newMat, error: matErr } = await supabase
              .from('materials')
              .insert({
                name: m.name,
                unidade_nativa: m.unit || 'kg',
                unit_of_measure: m.unit || 'kg',
                status: 'active',
              })
              .select()
              .single()
            if (matErr) throw matErr
            matId = newMat.id
          }
        }

        compsToInsert.push({
          service_id: finalServiceId,
          material_id: matId,
          coefficient: m.coefficient,
          waste_percentage: m.waste_percentage,
        })
      }

      const { error: compErr } = await supabase.from('compositions').insert(compsToInsert)
      if (compErr) throw compErr

      const { error: wsErr } = await supabase.from('work_services').insert({
        work_id: obraId,
        service_id: finalServiceId,
        target_quantity: Number(customQuantity),
        status: 'planned',
      })
      if (wsErr) throw wsErr

      toast({ title: 'Serviço personalizado adicionado!' })
      setOpenCustom(false)
      setCustomName('')
      setCustomQuantity('')
      setCustomUnit('m2')
      setAiMaterials([])
      fetchData()
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
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
            Adicione serviços para calcular automaticamente as necessidades de insumos.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Adicionar Serviço
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Serviço do Catálogo</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 mt-4">
                <div className="space-y-2 flex-1">
                  <Label>Serviço (Catálogo)</Label>
                  <div className="flex items-center gap-2">
                    <Select value={selectedService} onValueChange={setSelectedService} required>
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
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setOpen(false)
                        setOpenCustom(true)
                      }}
                      title="Criar Serviço Personalizado com IA"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label>
                    Quantidade Planejada (
                    {catalog.find((c) => c.id === selectedService)?.unit || ''})
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>

                {selectedService && selectedServiceComps.length > 0 && quantity && (
                  <div className="space-y-3 mt-4 border rounded-md p-4 bg-muted/20">
                    <h4 className="font-medium flex items-center gap-2 text-sm">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      Validação de Estoque
                    </h4>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {selectedServiceComps.map((comp) => {
                        const mat = comp.materials
                        const reqNative =
                          comp.coefficient *
                          (1 + (comp.waste_percentage || 0) / 100) *
                          (Number(quantity) || 0)
                        const { valid, stockNative, unit } = validateMaterialStock(mat, reqNative)

                        return (
                          <div
                            key={comp.id}
                            className="flex justify-between text-sm items-center border-b pb-2 last:border-0 last:pb-0"
                          >
                            <div>
                              <p className="font-medium">{mat?.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Solicitado: {reqNative.toFixed(2)} {unit}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={`font-medium ${valid ? 'text-emerald-600' : 'text-destructive'}`}
                              >
                                Estoque: {Number(stockNative).toFixed(2)} {unit}
                              </p>
                              {!valid && (
                                <p className="text-xs text-destructive">Estoque insuficiente</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full">
                  Adicionar Serviço
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={openCustom} onOpenChange={setOpenCustom}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Criar Serviço Personalizado</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddCustom} className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>Nome do Serviço</Label>
                    <Input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Ex: Parede Decorativa"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade</Label>
                    <Input
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      placeholder="Ex: m2"
                      required
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
                  Sugerir Composição
                </Button>

                {aiMaterials.length > 0 && (
                  <div className="space-y-3 mt-4 border rounded-md p-4 bg-card">
                    <h4 className="font-medium flex items-center gap-2 text-sm">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      Composição Sugerida (Ajuste se necessário)
                    </h4>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {aiMaterials.map((aim, idx) => {
                        const densityData = densities[aim.matchedMaterialId]
                        const convertedCoeff = ConversaoUnidadesService.converterParaKg(
                          aim.coefficient,
                          aim.unit,
                          densityData?.densidade_kg_m3,
                          densityData?.peso_unitario_kg,
                        )

                        const qty = Number(customQuantity) || 0
                        const reqNative =
                          aim.coefficient * (1 + (aim.waste_percentage || 0) / 100) * qty
                        let mat = dbMaterials.find((m) => m.id === aim.matchedMaterialId)
                        if (!mat) {
                          mat = {
                            id: 'new',
                            name: aim.name,
                            unidade_nativa: aim.unit || 'kg',
                            stock_quantity: 0,
                          }
                        }

                        const { valid, stockNative, unit } = validateMaterialStock(mat, reqNative)
                        const showWarning = qty > 0 && !valid

                        return (
                          <div
                            key={idx}
                            className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-md text-sm items-center ${showWarning ? 'bg-destructive/5 border-destructive/30' : 'bg-muted/30'}`}
                          >
                            <div>
                              <p className="font-medium text-foreground">{aim.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                IA Sugere: {aim.coefficient} {aim.unit} (+{aim.waste_percentage}%
                                perda)
                              </p>
                              {qty > 0 && (
                                <p className="text-xs mt-1 font-medium text-muted-foreground">
                                  Solicitado total: {reqNative.toFixed(2)} {unit}
                                </p>
                              )}
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
                                <SelectTrigger
                                  className={`h-8 bg-background ${showWarning ? 'border-destructive/50' : ''}`}
                                >
                                  <SelectValue placeholder="Selecionar Material..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new">-- Criar Novo Material --</SelectItem>
                                  {dbMaterials.map((dbm) => (
                                    <SelectItem key={dbm.id} value={dbm.id}>
                                      {dbm.name} (Estoque: {dbm.stock_quantity || 0}{' '}
                                      {dbm.unidade_nativa})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex justify-between items-center">
                                <p className="text-xs text-muted-foreground">
                                  Conv. por unid: {convertedCoeff.toFixed(2)} kg
                                </p>
                                {qty > 0 && (
                                  <p
                                    className={`text-xs font-medium ${valid ? 'text-emerald-600' : 'text-destructive'}`}
                                  >
                                    Estoque: {Number(stockNative).toFixed(2)} {unit}
                                  </p>
                                )}
                              </div>
                              {showWarning && (
                                <p className="text-xs text-destructive text-right font-medium">
                                  ⚠️ Estoque insuficiente
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t mt-4 pt-4">
                  <Label>Quantidade Planejada ({customUnit})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={customQuantity}
                    onChange={(e) => setCustomQuantity(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full">
                  Salvar Serviço e Composição
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
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

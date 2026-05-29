import React, { createContext, useContext, useState, ReactNode } from 'react'
import { Obra, Stage, Diario, Material, Despesa, Equipe } from '@/types'
import {
  mockObras,
  mockStages,
  mockMateriais,
  mockDespesas,
  mockEquipes,
  mockDiarios,
} from '@/lib/mock-data'

interface AppStore {
  obras: Obra[]
  stages: Stage[]
  materiais: Material[]
  despesas: Despesa[]
  equipes: Equipe[]
  diarios: Diario[]
  addObra: (obra: Obra) => void
  addDespesa: (despesa: Despesa) => void
  addDiario: (diario: Diario) => void
  updateMaterialQuantity: (id: string, delta: number) => void
}

const AppContext = createContext<AppStore | null>(null)

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [obras, setObras] = useState<Obra[]>(mockObras)
  const [stages, setStages] = useState<Stage[]>(mockStages)
  const [materiais, setMateriais] = useState<Material[]>(mockMateriais)
  const [despesas, setDespesas] = useState<Despesa[]>(mockDespesas)
  const [equipes, setEquipes] = useState<Equipe[]>(mockEquipes)
  const [diarios, setDiarios] = useState<Diario[]>(mockDiarios)

  const addObra = (obra: Obra) => setObras((prev) => [obra, ...prev])
  const addDespesa = (despesa: Despesa) => setDespesas((prev) => [despesa, ...prev])
  const addDiario = (diario: Diario) => setDiarios((prev) => [diario, ...prev])
  const updateMaterialQuantity = (id: string, delta: number) => {
    setMateriais((prev) =>
      prev.map((m) => (m.id === id ? { ...m, quantity: m.quantity + delta } : m)),
    )
  }

  return (
    <AppContext.Provider
      value={{
        obras,
        stages,
        materiais,
        despesas,
        equipes,
        diarios,
        addObra,
        addDespesa,
        addDiario,
        updateMaterialQuantity,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export default function useAppStore() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppStore must be used within AppProvider')
  return context
}

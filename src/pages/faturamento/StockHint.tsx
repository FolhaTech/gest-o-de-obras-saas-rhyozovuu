import { useMemo } from 'react'
import { Boxes } from 'lucide-react'
import { findStock, normalizeName, stockAdvice, type StockMaterial } from '@/lib/stock-hint'

interface Props {
  item: string
  quantity: number
  unit: string
  materials: StockMaterial[]
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** Aviso sob o item do pedido: quanto desse item já existe no estoque (Materiais). */
export default function StockHint({ item, quantity, unit, materials }: Props) {
  const found = useMemo(() => findStock(item, materials), [item, materials])
  if (normalizeName(item).length < 3) return null

  if (found.exact) {
    const advice = stockAdvice(found.exact, quantity, unit)
    const cls =
      advice.level === 'enough'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : advice.level === 'partial'
          ? 'border-blue-200 bg-blue-50 text-blue-900'
          : 'border-muted bg-muted/30 text-muted-foreground'
    return (
      <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${cls}`} role="status">
        <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{advice.text}</span>
      </div>
    )
  }

  if (found.similar.length > 0) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900" role="status">
        <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Não achei esse nome no estoque, mas há parecidos:{' '}
          {found.similar.map((s, i) => (
            <span key={s.name}>
              {i > 0 && '; '}
              <strong>{s.name}</strong> ({fmt(s.general)}{s.unit ? ' ' + s.unit : ''})
            </span>
          ))}
          . Confira antes de comprar.
        </span>
      </div>
    )
  }

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <Boxes className="h-3.5 w-3.5 shrink-0" /> Esse item não está no estoque (Materiais).
    </p>
  )
}

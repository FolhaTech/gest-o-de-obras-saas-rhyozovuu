/**
 * Financeiro > Compras: leitura e escrita do arquivo .xlsx da planilha de itens a comprar (regras em purchase-sheet.ts).
 * As bibliotecas de Excel são carregadas só quando o usuário exporta ou importa (não pesam na abertura do sistema).
 */
import { COL, GUIDE_SHEET_NAME, HEADERS, SHEET_NAME, exportRows, type SheetQuote, type SheetRequest } from './purchase-sheet'
import { MIN_QUOTES } from './purchases'

type Cell = string | number | boolean | Date | null | { value: unknown; [k: string]: unknown }

/** Texto da aba "Como preencher". */
export const GUIDE_LINES: string[] = [
  'Como preencher a planilha de itens a comprar',
  '',
  `1. Cada linha é um item pedido. Para cotar, preencha o Fornecedor e o Valor unitário (ou o Valor total) da linha.`,
  `2. Para cotar o mesmo item com outro fornecedor, copie a linha inteira (com o ID) e troque o Fornecedor e os valores.`,
  `3. Cada pedido precisa de pelo menos ${MIN_QUOTES} fornecedores diferentes para ser enviado ao admin.`,
  '4. Pagamento: escreva "Antecipado" (antes da entrega) ou "Após a entrega". Em branco vale "Após a entrega".',
  '5. Prazo de entrega é em dias (número inteiro). Condições e Observação da cotação são livres.',
  '6. Valor unitário x Quantidade = Valor total (a coluna total calcula sozinha).',
  '7. NÃO altere a coluna ID nem apague a linha de cabeçalho: é por elas que o sistema reconhece o pedido.',
  '8. Linhas sem Fornecedor e sem valor são ignoradas. Só pedidos pendentes ou em cotação aceitam cotações.',
  '9. Depois de preencher, volte ao sistema (Financeiro > Compras) e use "Importar planilha". O sistema mostra o que vai gravar antes.',
]

const dateCell = (iso: string | null): Cell => {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: 'dd/mm/yyyy' }
}

/** Monta o arquivo .xlsx (duas abas: os itens e o guia de preenchimento). */
export async function buildPurchaseWorkbook(requests: SheetRequest[], quotes: SheetQuote[]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const body = exportRows(requests, quotes)
  const head: Cell[] = HEADERS.map((h) => ({ value: h, fontWeight: 'bold', backgroundColor: '#E7EEF9', wrap: true, alignVertical: 'center' }))
  const moneyFmt = '#,##0.00'
  const rows: Cell[][] = [head]
  body.forEach((r, i) => {
    const line = i + 2 // linha no Excel (cabeçalho = 1)
    const qty = COL.quantity
    const col = (c: number) => String.fromCharCode(65 + c)
    const unitRef = `${col(COL.unitValue)}${line}`
    const qtyRef = `${col(qty)}${line}`
    rows.push(
      r.map((v, c): Cell => {
        if (c === COL.neededBy) return dateCell(v as string | null)
        if (c === COL.unitValue) return v === null ? null : { value: v, type: Number, format: moneyFmt }
        // total: sempre fórmula (unitário x quantidade), para acompanhar o que o usuário digitar
        if (c === COL.totalValue) {
          return { value: `=IF(AND(ISNUMBER(${qtyRef}),ISNUMBER(${unitRef})),ROUND(${qtyRef}*${unitRef},2),"")`, type: 'Formula', format: moneyFmt }
        }
        if (c === COL.quantity) return v === null ? null : { value: v, type: Number }
        if (c === COL.deliveryDays) return v === null ? null : { value: v, type: Number }
        return v as Cell
      }),
    )
  })
  const widths = [38, 32, 11, 9, 20, 11, 13, 22, 24, 30, 24, 16, 16, 18, 14, 26, 30]
  const guide: Cell[][] = GUIDE_LINES.map((t, i) => [i === 0 ? { value: t, fontWeight: 'bold', fontSize: 14 } : t])
  const file = writeExcelFile([
    { data: rows as never, sheet: SHEET_NAME, columns: widths.map((width) => ({ width })), stickyRowsCount: 1 },
    { data: guide as never, sheet: GUIDE_SHEET_NAME, columns: [{ width: 120 }] },
  ] as never)
  return file.toBlob()
}

/** Lê a primeira aba (ou a aba dos itens, se achar pelo nome) como linhas de células. */
export async function readPurchaseWorkbook(file: Blob | ArrayBuffer): Promise<unknown[][]> {
  const { readSheet } = await import('read-excel-file/universal')
  try {
    return (await readSheet(file as never, SHEET_NAME as never)) as unknown[][]
  } catch {
    // arquivo sem a aba com o nome esperado (renomeada): lê a primeira
    return (await readSheet(file as never)) as unknown[][]
  }
}

/** Baixa um Blob como arquivo (cria um link temporário). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

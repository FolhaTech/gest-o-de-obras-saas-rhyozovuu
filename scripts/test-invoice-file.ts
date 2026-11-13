// Testa as regras de src/lib/invoice-file.ts. Uso: npx tsx scripts/test-invoice-file.ts
import {
  INVOICE_MAX_BYTES,
  belongsToRequest,
  formatFileSize,
  invoiceContentType,
  invoicePath,
  safeFileName,
  validateInvoiceFile,
} from '../src/lib/invoice-file.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}

// ---------------------------------------------------------------- tipo do arquivo
ok('PDF', invoiceContentType({ name: 'nota.pdf', type: 'application/pdf' }) === 'application/pdf')
ok('imagens aceitas', ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].every((t) => invoiceContentType({ name: 'x', type: t }) === t))
ok('image/jpg (apelido) vira image/jpeg', invoiceContentType({ name: 'x.jpg', type: 'image/jpg' }) === 'image/jpeg')
ok('tipo vazio: vale a extensão', invoiceContentType({ name: 'IMG_0001.HEIC', type: '' }) === 'image/heic' && invoiceContentType({ name: 'nota.PDF' }) === 'application/pdf' && invoiceContentType({ name: 'a.jpeg', type: '' }) === 'image/jpeg')
ok('tipo genérico (octet-stream): vale a extensão', invoiceContentType({ name: 'foto.png', type: 'application/octet-stream' }) === 'image/png')
ok('tipo vazio e sem extensão conhecida: recusa', invoiceContentType({ name: 'nota', type: '' }) === null && invoiceContentType({ name: 'planilha.xlsx', type: '' }) === null)
ok('outros tipos são recusados (mesmo com extensão boa)', invoiceContentType({ name: 'a.pdf', type: 'text/html' }) === null && invoiceContentType({ name: 'a.png', type: 'image/gif' }) === null && invoiceContentType({ name: 'a.jpg', type: 'image/svg+xml' }) === null)

// ---------------------------------------------------------------- validação
ok('arquivo bom', validateInvoiceFile({ name: 'nf.pdf', type: 'application/pdf', size: 120_000 }) === null && validateInvoiceFile({ name: 'foto.jpg', type: 'image/jpeg', size: INVOICE_MAX_BYTES }) === null)
ok('vazio', /vazio/.test(validateInvoiceFile({ name: 'nf.pdf', type: 'application/pdf', size: 0 }) ?? ''))
const grande = validateInvoiceFile({ name: 'nf.pdf', type: 'application/pdf', size: INVOICE_MAX_BYTES + 1 })
ok('acima de 15 MB (diz o tamanho e o limite)', /15 MB/.test(grande ?? '') && /limite/.test(grande ?? ''), grande ?? '')
ok('tipo recusado diz o que enviar', /JPG.*PDF/.test(validateInvoiceFile({ name: 'a.docx', type: 'application/msword', size: 10 }) ?? ''))

// ---------------------------------------------------------------- nome e caminho
ok('nome sem acento e símbolos', safeFileName('Nota Fiscal nº 12 (Cimento).pdf') === 'Nota_Fiscal_n_12_Cimento_.pdf', safeFileName('Nota Fiscal nº 12 (Cimento).pdf'))
ok('mantém ponto, hífen e sublinhado', safeFileName('nf-001_final.v2.pdf') === 'nf-001_final.v2.pdf')
ok('sem barras (não sai da pasta)', !safeFileName('../../etc/passwd').includes('/') && !safeFileName('a\\b\\c.pdf').includes('\\') && !safeFileName('..\\x.pdf').startsWith('.'))
ok('vazio vira "nota"', safeFileName('') === 'nota' && safeFileName('???') === 'nota')
const longo = safeFileName('a'.repeat(200) + '.pdf')
ok('nome longo é cortado e mantém a extensão', longo.length === 80 && longo.endsWith('.pdf'), String(longo.length))
const id = '3f2b8c1e-1111-4222-8333-444455556666'
ok('caminho: pasta da solicitação, momento e nome seguro', invoicePath(id, 'Nota Ação.pdf', 1700000000000) === `${id}/1700000000000-Nota_Acao.pdf`, invoicePath(id, 'Nota Ação.pdf', 1700000000000))
ok('o caminho passa na regra do banco (uuid/um-arquivo)', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/.test(invoicePath(id, '../../x y.pdf', 1)))
ok('pertence à solicitação', belongsToRequest(`${id}/1-a.pdf`, id) && !belongsToRequest(`outro/1-a.pdf`, id) && !belongsToRequest(`${id}/sub/a.pdf`, id) && !belongsToRequest(null, id) && !belongsToRequest('', id) && !belongsToRequest(`${id}x/a.pdf`, id))

// ---------------------------------------------------------------- tamanho legível
ok('tamanho legível', formatFileSize(500) === '500 B' && formatFileSize(2048) === '2 KB' && formatFileSize(1572864) === '1,5 MB' && formatFileSize(INVOICE_MAX_BYTES) === '15 MB', `${formatFileSize(2048)} ${formatFileSize(1572864)} ${formatFileSize(INVOICE_MAX_BYTES)}`)

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)

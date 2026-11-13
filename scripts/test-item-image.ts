// Testa as regras de src/lib/item-image.ts e src/lib/resize-image.ts. Uso: npx tsx scripts/test-item-image.ts
import {
  IMAGE_MAX_BYTES,
  imageContentType,
  isItemImageOf,
  isQuoteImageOf,
  itemImagePath,
  quoteImagePath,
  validateImage,
} from '../src/lib/item-image.ts'
import { MAX_SIDE, fitWithin, renamedFor } from '../src/lib/resize-image.ts'

let failed = 0
const ok = (n: string, c: boolean, extra = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -> ' + extra : ''}`)
  if (!c) failed++
}
const f = (name: string, type: string, size = 1000) => ({ name, type, size })

// ---------------------------------------------------------------- tipo
ok('JPG, PNG, WEBP e HEIC pelo tipo do navegador', imageContentType(f('a.jpg', 'image/jpeg')) === 'image/jpeg' && imageContentType(f('a.png', 'image/png')) === 'image/png' && imageContentType(f('a.webp', 'image/webp')) === 'image/webp' && imageContentType(f('a.heic', 'image/heic')) === 'image/heic')
ok('apelidos do tipo (image/jpg, image/pjpeg) viram image/jpeg', imageContentType(f('a.jpg', 'image/jpg')) === 'image/jpeg' && imageContentType(f('a.jpg', 'image/pjpeg')) === 'image/jpeg')
ok('tipo vazio ou genérico: vale a extensão (HEIC do celular)', imageContentType(f('IMG_1.HEIC', '')) === 'image/heic' && imageContentType(f('foto.jpeg', 'application/octet-stream')) === 'image/jpeg' && imageContentType(f('a.heif', '')) === 'image/heif')
ok('PDF não vale como imagem', imageContentType(f('nota.pdf', 'application/pdf')) === null && imageContentType(f('nota.pdf', '')) === null)
ok('GIF, SVG e HTML não valem; tipo específico fora da lista não é salvo pela extensão', imageContentType(f('a.gif', 'image/gif')) === null && imageContentType(f('a.svg', 'image/svg+xml')) === null && imageContentType(f('a.jpg', 'text/html')) === null && imageContentType(f('semextensao', '')) === null)

// ---------------------------------------------------------------- validação
ok('imagem comum passa', validateImage(f('a.jpg', 'image/jpeg', 2_000_000)) === null)
ok('vazio é recusado', /vazio/.test(validateImage(f('a.jpg', 'image/jpeg', 0)) ?? ''))
ok('acima do limite é recusado, com o tamanho na mensagem', /limite é 10 MB/.test(validateImage(f('a.jpg', 'image/jpeg', IMAGE_MAX_BYTES + 1)) ?? '') && validateImage(f('a.jpg', 'image/jpeg', IMAGE_MAX_BYTES)) === null)
ok('PDF é recusado com mensagem de imagem', /imagem/.test(validateImage(f('a.pdf', 'application/pdf')) ?? ''))

// ---------------------------------------------------------------- caminhos
const R = '11111111-2222-3333-4444-555555555555'
const Q = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
ok('caminho da imagem do item', itemImagePath(R, 'Foto da Obra ç.JPG', 1700) === `${R}/item/1700-Foto_da_Obra_c.JPG`, itemImagePath(R, 'Foto da Obra ç.JPG', 1700))
ok('caminho da imagem da cotação', quoteImagePath(R, Q, 'proposta final.png', 5) === `${R}/quotes/${Q}/5-proposta_final.png`)
ok('nome vazio ou só símbolos cai em "imagem"', itemImagePath(R, '???', 1) === `${R}/item/1-imagem` && quoteImagePath(R, Q, '', 1) === `${R}/quotes/${Q}/1-imagem`)
ok('o caminho do item pertence à solicitação (e só à pasta item)', isItemImageOf(`${R}/item/x.jpg`, R) && !isItemImageOf(`${Q}/item/x.jpg`, R) && !isItemImageOf(`${R}/x.jpg`, R) && !isItemImageOf(`${R}/item/a/b.jpg`, R) && !isItemImageOf(`${R}/quotes/${Q}/x.jpg`, R) && !isItemImageOf(null, R))
ok('o caminho da cotação pertence à cotação da solicitação', isQuoteImageOf(`${R}/quotes/${Q}/x.jpg`, R, Q) && !isQuoteImageOf(`${R}/quotes/outra/x.jpg`, R, Q) && !isQuoteImageOf(`${R}/item/x.jpg`, R, Q) && !isQuoteImageOf(`${R}/quotes/${Q}/a/b.jpg`, R, Q) && !isQuoteImageOf(undefined, R, Q))

// ---------------------------------------------------------------- redução
ok('lado maior até 1600 px não muda', fitWithin(1200, 800).width === 1200 && fitWithin(1600, 1600).height === 1600 && MAX_SIDE === 1600)
ok('foto de celular (4000x3000) cabe em 1600 mantendo a proporção', JSON.stringify(fitWithin(4000, 3000)) === JSON.stringify({ width: 1600, height: 1200 }))
ok('retrato (3000x4000)', JSON.stringify(fitWithin(3000, 4000)) === JSON.stringify({ width: 1200, height: 1600 }))
ok('limite próprio e imagem finíssima nunca chega a zero', JSON.stringify(fitWithin(1000, 500, 500)) === JSON.stringify({ width: 500, height: 250 }) && fitWithin(100000, 1).height === 1)
ok('nome com a extensão do tipo novo', renamedFor('IMG_1.HEIC', 'image/jpeg') === 'IMG_1.jpg' && renamedFor('a.png', 'image/png') === 'a.png' && renamedFor('sem', 'image/jpeg') === 'sem.jpg' && renamedFor('', 'image/jpeg') === 'imagem.jpg' && renamedFor('a.b.webp', 'image/jpeg') === 'a.b.jpg')

console.log(failed ? `\n${failed} FALHA(S)` : '\nTudo certo')
process.exit(failed ? 1 : 0)

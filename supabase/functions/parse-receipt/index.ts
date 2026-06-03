import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import jsQR from 'npm:jsqr@1.4.0'
import * as jpeg from 'npm:jpeg-js@0.4.4'
import { Buffer } from 'node:buffer'
import { PNG } from 'npm:pngjs@7.0.0'

function formatCnpj(cnpj: string) {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function parseNFCeUrl(urlOrKey: string) {
  const cleanKey = urlOrKey.replace(/\D/g, '')
  if (cleanKey.length === 44 && !urlOrKey.startsWith('http')) {
    const cnpj = cleanKey.substring(6, 20)
    return {
      merchantCnpj: formatCnpj(cnpj),
      totalValue: undefined,
      merchantName: 'Estabelecimento',
      date: new Date().toISOString().split('T')[0],
    }
  }

  try {
    const urlObj = new URL(urlOrKey)

    const p = urlObj.searchParams.get('p')
    if (p) {
      const parts = p.split('|')
      const chNFe = parts[0]
      const vNF = parts[4]

      if (chNFe && chNFe.length === 44) {
        const cnpj = chNFe.substring(6, 20)
        return {
          merchantCnpj: formatCnpj(cnpj),
          totalValue: vNF ? parseFloat(vNF) : undefined,
          merchantName: 'Estabelecimento (NFC-e)',
          date: new Date().toISOString().split('T')[0],
        }
      }
    }

    const chNFe = urlObj.searchParams.get('chNFe') || urlObj.searchParams.get('chave')
    const vNF = urlObj.searchParams.get('vNF') || urlObj.searchParams.get('valor')

    if (chNFe && chNFe.length === 44) {
      const cnpj = chNFe.substring(6, 20)
      return {
        merchantCnpj: formatCnpj(cnpj),
        totalValue: vNF ? parseFloat(vNF) : undefined,
        merchantName: 'Estabelecimento (NFC-e)',
        date: new Date().toISOString().split('T')[0],
      }
    }
  } catch (e) {
    // Ignore invalid URLs
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url, image } = await req.json()
    if (!url && !image) throw new Error('URL ou imagem é obrigatório')

    let extractedUrl = url

    if (image && !extractedUrl) {
      const isJpeg = image.startsWith('data:image/jpeg')
      const isPng = image.startsWith('data:image/png')

      if (isJpeg || isPng) {
        const base64Data = image.split(',')[1]
        const bytes = Buffer.from(base64Data, 'base64')

        let imageData, width, height

        if (isJpeg) {
          const decoded = jpeg.decode(bytes, { useTArray: true })
          imageData = decoded.data
          width = decoded.width
          height = decoded.height
        } else if (isPng) {
          const decoded = PNG.sync.read(bytes)
          imageData = decoded.data
          width = decoded.width
          height = decoded.height
        }

        if (imageData && width && height) {
          const clamped = new Uint8ClampedArray(
            imageData.buffer,
            imageData.byteOffset,
            imageData.byteLength,
          )
          const code = jsQR(clamped, width, height)
          if (code) {
            extractedUrl = code.data
          } else {
            throw new Error('Nenhum QR Code encontrado na imagem. Tente uma imagem mais nítida.')
          }
        }
      } else {
        throw new Error('Formato de imagem não suportado. Use JPEG ou PNG.')
      }
    }

    if (!extractedUrl) {
      throw new Error('Não foi possível processar a imagem ou extrair a URL.')
    }

    const parsed = parseNFCeUrl(extractedUrl)

    if (parsed) {
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      return new Response(
        JSON.stringify({ error: 'URL extraída do QR Code não é uma NFC-e válida.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

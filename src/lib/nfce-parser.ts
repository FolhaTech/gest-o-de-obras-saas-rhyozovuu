export function parseNFCeUrl(urlOrKey: string) {
  // If it's exactly 44 digits, we can extract the CNPJ
  const cleanKey = urlOrKey.replace(/\D/g, '')
  if (cleanKey.length === 44 && !urlOrKey.startsWith('http')) {
    const cnpj = cleanKey.substring(6, 20)
    return {
      merchantCnpj: formatCnpj(cnpj),
      totalValue: undefined,
    }
  }

  try {
    const urlObj = new URL(urlOrKey)

    // Pattern 1: URL has a 'p' query param containing fields separated by '|'
    // Format: chNFe|versao|tpAmb|cDest|vNF|vICMS|digVal|cIdToken|cHashQRCode
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
        }
      }
    }

    // Pattern 2: URL has direct query params 'chNFe' and 'vNF'
    const chNFe = urlObj.searchParams.get('chNFe') || urlObj.searchParams.get('chave')
    const vNF = urlObj.searchParams.get('vNF') || urlObj.searchParams.get('valor')

    if (chNFe && chNFe.length === 44) {
      const cnpj = chNFe.substring(6, 20)
      return {
        merchantCnpj: formatCnpj(cnpj),
        totalValue: vNF ? parseFloat(vNF) : undefined,
      }
    }
  } catch (e) {
    // Ignore invalid URLs
  }
  return null
}

function formatCnpj(cnpj: string) {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

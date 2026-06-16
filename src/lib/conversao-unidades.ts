export const ConversaoUnidadesService = {
  converterParaKg: (
    quantidade: number,
    unidadeOrigem: string,
    densidadeKgM3?: number | null,
    pesoUnitarioKg?: number | null,
  ): number => {
    const uni = unidadeOrigem?.toLowerCase() || ''

    if (uni === 'kg') return quantidade

    if ((uni === 'm3' || uni === 'm³') && densidadeKgM3) {
      return quantidade * densidadeKgM3
    }

    if ((uni === 'un' || uni === 'unidade' || uni === 'saco') && pesoUnitarioKg) {
      return quantidade * pesoUnitarioKg
    }

    if (uni === 'g') return quantidade / 1000
    if (uni === 't' || uni === 'ton') return quantidade * 1000
    if (uni === 'l' || uni === 'litro') return quantidade // Aproximação da água onde 1L = 1kg

    // Retorna a quantidade original como fallback
    return quantidade
  },
}

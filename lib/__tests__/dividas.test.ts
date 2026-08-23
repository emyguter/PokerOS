import { describe, it, expect } from 'vitest'
import { calcularAcordo, percentualMulta, valorComMulta, diasDeAtraso } from '../dividas'

describe('calcularAcordo', () => {
  it('sem juros, divide igual e a soma bate com o valor integral', () => {
    const r = calcularAcordo({
      valorIntegral: 1000, jurosAtivo: false, jurosPct: null,
      quantidadeParcelas: 4, pagamentoMinimo: null, dataPrimeiraParcela: '2026-08-17',
    })
    expect(r.valorComJuros).toBe(1000)
    expect(r.quantidadeParcelasFinal).toBe(4)
    expect(r.parcelas).toHaveLength(4)
    expect(r.parcelas.reduce((s, p) => s + p.valor, 0)).toBe(1000)
    expect(r.parcelas.every((p) => p.valor === 250)).toBe(true)
  })

  it('com juros, compõe por parcela conforme o período (parcela N = base × (1+juros)^N)', () => {
    const r = calcularAcordo({
      valorIntegral: 1000, jurosAtivo: true, jurosPct: 10,
      quantidadeParcelas: 2, pagamentoMinimo: null, dataPrimeiraParcela: '2026-08-17',
    })
    expect(r.parcelas[0].valor).toBe(550) // 500 × 1.10^1
    expect(r.parcelas[1].valor).toBe(605) // 500 × 1.10^2
    expect(r.valorComJuros).toBe(1155)
  })

  it('planilha de referência: base 1000, 1% a.s., 6 parcelas', () => {
    const r = calcularAcordo({
      valorIntegral: 6000, jurosAtivo: true, jurosPct: 1,
      quantidadeParcelas: 6, pagamentoMinimo: null, dataPrimeiraParcela: '2026-08-17',
    })
    expect(r.parcelas.map((p) => p.valor)).toEqual([1010, 1020.1, 1030.3, 1040.6, 1051.01, 1061.52])
    // Planilha de referência soma as células sem arredondar (dá 6.213,54) —
    // aqui cada parcela já é o valor real cobrado (arredondado pro centavo),
    // então o total é a soma do que de fato é cobrável: 6.213,53.
    expect(r.valorComJuros).toBe(6213.53)
  })

  it('parcela abaixo do pagamento mínimo usa o mínimo e ajusta a quantidade de parcelas', () => {
    const r = calcularAcordo({
      valorIntegral: 1000, jurosAtivo: false, jurosPct: null,
      quantidadeParcelas: 20, pagamentoMinimo: 200, dataPrimeiraParcela: '2026-08-17',
    })
    expect(r.usouPagamentoMinimo).toBe(true)
    expect(r.valorParcela).toBe(200)
    expect(r.quantidadeParcelasFinal).toBe(5)
    expect(r.parcelas).toHaveLength(5)
    expect(r.parcelas.reduce((s, p) => s + p.valor, 0)).toBe(1000)
  })

  it('parcelas vencem semanalmente a partir da data da primeira', () => {
    const r = calcularAcordo({
      valorIntegral: 300, jurosAtivo: false, jurosPct: null,
      quantidadeParcelas: 3, pagamentoMinimo: null, dataPrimeiraParcela: '2026-08-17',
    })
    expect(r.parcelas.map((p) => p.vencimento)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31'])
  })

  it('última parcela absorve a sobra de arredondamento', () => {
    const r = calcularAcordo({
      valorIntegral: 100, jurosAtivo: false, jurosPct: null,
      quantidadeParcelas: 3, pagamentoMinimo: null, dataPrimeiraParcela: '2026-08-17',
    })
    expect(r.parcelas.reduce((s, p) => s + p.valor, 0)).toBe(100)
  })
})

describe('percentualMulta / valorComMulta', () => {
  const faixas = [
    { quantidade: 1, unidade: 'semanas' as const, percentual: 2 },
    { quantidade: 2, unidade: 'semanas' as const, percentual: 10 },
  ]

  it('sem atraso suficiente pra nenhuma faixa, 0%', () => {
    expect(percentualMulta(3, faixas)).toBe(0)
  })

  it('substitui (não acumula) — 2 semanas usa só 10%, não 12%', () => {
    expect(percentualMulta(14, faixas)).toBe(10)
  })

  it('1 semana de atraso usa 2%', () => {
    expect(percentualMulta(7, faixas)).toBe(2)
  })

  it('valorComMulta aplica o percentual sobre a parcela, não o total', () => {
    expect(valorComMulta(500, 14, faixas)).toBe(550)
    expect(valorComMulta(500, 0, faixas)).toBe(500)
  })
})

describe('diasDeAtraso', () => {
  it('nunca negativo quando ainda não venceu', () => {
    expect(diasDeAtraso('2026-08-20', new Date('2026-08-17T12:00:00'))).toBe(0)
  })

  it('conta dias corridos após o vencimento', () => {
    expect(diasDeAtraso('2026-08-10', new Date('2026-08-17T12:00:00'))).toBe(7)
  })
})

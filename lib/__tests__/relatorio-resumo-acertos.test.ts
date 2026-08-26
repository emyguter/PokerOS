import { describe, it, expect } from 'vitest'
import { calcularFeeRegra } from '../relatorio-resumo-acertos'

describe('calcularFeeRegra', () => {
  it('taxa_dinamica: soma só Fee MTT + Fee Cash, sem Operacional/SpinUp', () => {
    const fee = calcularFeeRegra({
      settlement_type: 'taxa_dinamica',
      fee_mtt_valor: 200,
      fee_cash_valor: 150,
      taxa_liga_valor: 999, // ignorado nesse tipo — Liga é camada à parte
      fee_calculado: 999,
      fee_operacional_valor: 999,
    })
    expect(fee).toBe(350)
  })

  it('taxa_fixa_variavel: usa a Taxa da Liga quando ela está configurada', () => {
    const fee = calcularFeeRegra({
      settlement_type: 'taxa_fixa_variavel',
      fee_mtt_valor: 0,
      fee_cash_valor: 0,
      taxa_liga_valor: 83.24,
      fee_calculado: 500,
      fee_operacional_valor: 45,
    })
    expect(fee).toBe(83.24)
  })

  it('taxa_fixa_variavel: cai pro fee_calculado do clube (menos Operacional, que já tem coluna própria) quando a Liga não tem nada configurado', () => {
    const fee = calcularFeeRegra({
      settlement_type: 'taxa_fixa_variavel',
      fee_mtt_valor: 0,
      fee_cash_valor: 0,
      taxa_liga_valor: 0,
      fee_calculado: 200,
      fee_operacional_valor: 50,
    })
    // 200 - 50 — sem subtrair, a Taxa Operacional contaria duas vezes
    // (achado no caso AK AMAKHA club 2, mesmo bug do ClubAcertoCard).
    expect(fee).toBe(150)
  })

  it('weekly_usd: mesmo fallback de taxa_fixa_variavel', () => {
    const fee = calcularFeeRegra({
      settlement_type: 'weekly_usd',
      fee_mtt_valor: 0,
      fee_cash_valor: 0,
      taxa_liga_valor: 0,
      fee_calculado: 150,
      fee_operacional_valor: 0, // weekly_usd nunca preenche isso no motor
    })
    expect(fee).toBe(150)
  })
})

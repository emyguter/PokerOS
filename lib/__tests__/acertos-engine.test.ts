import { describe, it, expect } from 'vitest'
import {
  calcularAcerto,
  valorIndicador,
  avaliarCondicoes,
  CONDICOES_VAZIAS,
  type ClubSettings,
  type ImportRow,
  type CondicaoAvaliavel,
} from '../acertos-engine'

function club(overrides: Partial<ClubSettings> = {}): ClubSettings {
  return {
    id: 'club-1',
    name: 'Clube Teste',
    external_id: '123',
    settlement_type: 'taxa_dinamica',
    taxa_tipo: 'fixa',
    fee_mtt_pct: 10,
    fee_cash_pct: 5,
    taxa_op_pct: 2,
    rebate_pct: 0,
    crypto_rebate_pct: 0,
    rakeback_pct: 0,
    spinup_pct: 3,
    wtr4_semanas_manual: null,
    ...overrides,
  }
}

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    id: 'row-1',
    import_id: 'import-1',
    club_name: 'Clube Teste',
    club_external_id: '123',
    rake_total: 1000,
    rake_mtt: 400,
    rake_cash: 500,
    rake_spinup: 100,
    player_result: -200,
    bilhetes: 0,
    ...overrides,
  }
}

function condicao(overrides: Partial<CondicaoAvaliavel> = {}): CondicaoAvaliavel {
  return {
    operador: '>',
    valor: 0,
    resultado_pct: 15,
    is_fallback: false,
    indicadorNomes: ['rake'],
    ...overrides,
  }
}

describe('valorIndicador', () => {
  it('rake retorna o valor absoluto do rake total', () => {
    expect(valorIndicador('rake', row({ rake_total: -1000 }), null)).toBe(1000)
  })
  it('rake_cash, rake_mtt, rake_spinup retornam o valor absoluto de cada base', () => {
    const r = row({ rake_cash: 500, rake_mtt: 400, rake_spinup: 100 })
    expect(valorIndicador('rake_cash', r, null)).toBe(500)
    expect(valorIndicador('rake_mtt', r, null)).toBe(400)
    expect(valorIndicador('rake_spinup', r, null)).toBe(100)
  })
  it('resultado_jogador NÃO usa valor absoluto (prejuízo do jogador precisa continuar negativo)', () => {
    expect(valorIndicador('resultado_jogador', row({ player_result: -200 }), null)).toBe(-200)
  })
  it('wtr é a razão bruta Ganhos/Rake, sem multiplicar por 100', () => {
    expect(valorIndicador('wtr', row({ player_result: -250, rake_total: 1000 }), null)).toBeCloseTo(-0.25)
  })
  it('wtr é 0 quando rake_total é 0 (evita divisão por zero)', () => {
    expect(valorIndicador('wtr', row({ rake_total: 0 }), null)).toBe(0)
  })
  it('wtr_4_semanas usa o valor já calculado passado por parâmetro', () => {
    expect(valorIndicador('wtr_4_semanas', row(), -0.42)).toBe(-0.42)
    expect(valorIndicador('wtr_4_semanas', row(), null)).toBe(0)
  })
  it('indicador desconhecido retorna 0 em vez de quebrar', () => {
    expect(valorIndicador('coisa_que_nao_existe', row(), null)).toBe(0)
  })
})

describe('avaliarCondicoes', () => {
  it('retorna o resultado_pct da primeira condição que bate', () => {
    const condicoes = [
      condicao({ operador: '>', valor: 2000, resultado_pct: 20 }),
      condicao({ operador: '>', valor: 500, resultado_pct: 15 }),
    ]
    // rake=1000 não bate na primeira (>2000), bate na segunda (>500)
    expect(avaliarCondicoes(condicoes, row({ rake_total: 1000 }), null)).toBe(15)
  })

  it('respeita a ordem das condições — a primeira que bate vence, mesmo se outra também bateria', () => {
    const condicoes = [
      condicao({ operador: '>', valor: 500, resultado_pct: 15 }),
      condicao({ operador: '>', valor: 0, resultado_pct: 99 }),
    ]
    expect(avaliarCondicoes(condicoes, row({ rake_total: 1000 }), null)).toBe(15)
  })

  it.each([
    ['>', 500, 1000, true],
    ['>', 1000, 1000, false],
    ['>=', 1000, 1000, true],
    ['<', 1000, 500, true],
    ['<', 500, 1000, false],
    ['<=', 1000, 1000, true],
    ['=', 1000, 1000, true],
    ['=', 1000, 999, false],
  ] as const)('operador %s: %d vs rake %d -> bate=%s', (operador, valorCondicao, rakeTotal, deveriaBater) => {
    const condicoes = [condicao({ operador, valor: valorCondicao, resultado_pct: 42 })]
    const resultado = avaliarCondicoes(condicoes, row({ rake_total: rakeTotal }), null)
    expect(resultado).toBe(deveriaBater ? 42 : null)
  })

  it('soma múltiplos indicadores na mesma condição (ex: "Rake + Ganhos")', () => {
    const condicoes = [condicao({ operador: '>', valor: 700, indicadorNomes: ['rake', 'resultado_jogador'] })]
    // rake=1000 (abs) + resultado_jogador=-200 (sem abs) = 800 > 700
    expect(avaliarCondicoes(condicoes, row({ rake_total: 1000, player_result: -200 }), null)).toBe(15)
  })

  it('cai pra condição SENÃO (fallback) quando nenhuma outra bate', () => {
    const condicoes = [
      condicao({ operador: '>', valor: 5000, resultado_pct: 20 }),
      condicao({ is_fallback: true, resultado_pct: 5 }),
    ]
    expect(avaliarCondicoes(condicoes, row({ rake_total: 1000 }), null)).toBe(5)
  })

  it('retorna null quando nada bate e não há fallback', () => {
    const condicoes = [condicao({ operador: '>', valor: 5000, resultado_pct: 20 })]
    expect(avaliarCondicoes(condicoes, row({ rake_total: 1000 }), null)).toBeNull()
  })

  it('ignora condição com valor null (nunca bate, não é fallback)', () => {
    const condicoes = [condicao({ valor: null, resultado_pct: 20 })]
    expect(avaliarCondicoes(condicoes, row(), null)).toBeNull()
  })
})

describe('calcularAcerto — taxa_dinamica (todas as taxas fixas)', () => {
  it('Fee Cash usa a base Rake Cash quando é fixo (não Rake Total)', () => {
    const r = row({ rake_cash: 500 })
    const c = club({ settlement_type: 'taxa_dinamica', fee_cash_pct: 5 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.fee_cash_valor).toBe(25) // 500 * 5%
    expect(resultado.taxa_cash_pct_aplicada).toBe(5)
  })

  it('Fee MTT e SpinUp usam a própria base de rake; Taxa Operacional usa o Rake Total', () => {
    const r = row({ rake_total: 1000, rake_mtt: 400, rake_cash: 500, rake_spinup: 100 })
    const c = club({ fee_mtt_pct: 10, taxa_op_pct: 2, spinup_pct: 3 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.fee_mtt_valor).toBe(40) // 400 * 10%
    expect(resultado.fee_operacional_valor).toBe(20) // 1000 (rake total) * 2%
    expect(resultado.fee_spinup_valor).toBe(3) // 100 * 3%
  })

  it('Valor do Acerto = Rake Total + Ganhos do jogador − Taxa cobrada', () => {
    const r = row({ rake_total: 1000, rake_mtt: 400, rake_cash: 500, rake_spinup: 100, player_result: -200 })
    const c = club({ fee_mtt_pct: 10, fee_cash_pct: 5, taxa_op_pct: 2, spinup_pct: 3 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    // fee = 400*10% (mtt) + 500*5% (cash) + 1000*2% (operacional, base = rake total) + 100*3% (spinup) = 40 + 25 + 20 + 3 = 88
    expect(resultado.fee_calculado).toBe(88)
    expect(resultado.valor_acerto).toBe(1000 + -200 - 88) // 712
  })

  it('arredonda os valores pra 2 casas decimais', () => {
    const r = row({ rake_cash: 333 })
    const c = club({ fee_cash_pct: 7 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.fee_cash_valor).toBe(23.31) // 333 * 0.07 = 23.31 (sem dízima aqui, mas confere a rota de arredondamento)
  })
})

describe('calcularAcerto — taxa_dinamica (regra SE/ENTÃO variável)', () => {
  it('Fee Cash variável multiplica sobre o RAKE CASH, não sobre o Rake Total', () => {
    const r = row({ rake_total: 1000, rake_cash: 500 })
    const c = club()
    const condicoesPorCampo = { ...CONDICOES_VAZIAS, fee_cash: [condicao({ operador: '>', valor: 0, resultado_pct: 20 })] }
    const resultado = calcularAcerto(r, c, condicoesPorCampo, null)
    // confirmado célula a célula contra a planilha manual do Cássio
    // (Agreste_Poker, Authentic Gold): 500 * 20% = 100, NÃO 1000 * 20% = 200
    expect(resultado.fee_cash_valor).toBe(100)
    expect(resultado.taxa_cash_pct_aplicada).toBe(20)
  })

  it('Fee MTT variável multiplica sobre o Rake MTT (a própria base, diferente do Fee Cash)', () => {
    const r = row({ rake_total: 1000, rake_mtt: 400 })
    const c = club()
    const condicoesPorCampo = { ...CONDICOES_VAZIAS, fee_mtt: [condicao({ operador: '>', valor: 0, resultado_pct: 25 })] }
    const resultado = calcularAcerto(r, c, condicoesPorCampo, null)
    expect(resultado.fee_mtt_valor).toBe(100) // 400 * 25%, não 1000 * 25%
  })

  it('Taxa Operacional variável multiplica sobre o RAKE TOTAL, não sobre o Rake Cash', () => {
    const r = row({ rake_total: 1000, rake_cash: 500 })
    const c = club()
    const condicoesPorCampo = { ...CONDICOES_VAZIAS, taxa_op: [condicao({ operador: '>', valor: 0, resultado_pct: 9 })] }
    const resultado = calcularAcerto(r, c, condicoesPorCampo, null)
    // confirmado célula a célula contra a planilha manual do Cássio
    // (@fsapoker, Kings Online BR): 1000 * 9% = 90, NÃO 500 * 9% = 45
    expect(resultado.fee_operacional_valor).toBe(90)
  })

  it('quando a condição não bate e não há SENÃO, o percentual aplicado é 0', () => {
    const r = row({ rake_total: 1000 })
    const c = club()
    const condicoesPorCampo = { ...CONDICOES_VAZIAS, fee_cash: [condicao({ operador: '>', valor: 999999, resultado_pct: 20 })] }
    const resultado = calcularAcerto(r, c, condicoesPorCampo, null)
    expect(resultado.fee_cash_valor).toBe(0)
    expect(resultado.taxa_cash_pct_aplicada).toBe(0)
  })
})

describe('calcularAcerto — outros tipos de cobrança', () => {
  it('taxa_fixa_variavel: fee fixo sobre o rake total', () => {
    const r = row({ rake_total: 1000, player_result: -100 })
    const c = club({ settlement_type: 'taxa_fixa_variavel', fee_mtt_pct: 10 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.fee_calculado).toBe(100)
    expect(resultado.valor_acerto).toBe(1000 - 100 - 100) // 800
  })

  it('rakeback: rebate sobre o rake total, valor do acerto é o rebate negativo (custo da liga)', () => {
    const r = row({ rake_total: 1000 })
    const c = club({ settlement_type: 'rakeback', rakeback_pct: 8 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.rebate_calculado).toBe(80)
    expect(resultado.valor_acerto).toBe(-80)
  })

  it('weekly_usd: fee fixo menos rebate (comum + cripto)', () => {
    const r = row({ rake_total: 1000 })
    const c = club({ settlement_type: 'weekly_usd', fee_mtt_pct: 15, rebate_pct: 5, crypto_rebate_pct: 2 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.rebate_calculado).toBe(70) // 1000*5% + 1000*2%
    expect(resultado.fee_calculado).toBe(150) // 1000*15%
    expect(resultado.valor_acerto).toBe(150 - 70) // 80
  })

  it('tipo de cobrança desconhecido não quebra, só zera o valor do acerto', () => {
    const r = row()
    const c = club({ settlement_type: 'tipo_que_nao_existe' })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.valor_acerto).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import {
  calcularAcerto,
  calcularIndicacao,
  calcularWtr4Semanas,
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
    taxa_op_ativo: true,
    rebate_pct: 0,
    crypto_rebate_pct: 0,
    rakeback_pct: 0,
    spinup_pct: 3,
    wtr4_semanas_manual: null,
    league_id: null,
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

describe('calcularIndicacao', () => {
  it('aplica o percentual digitado sobre o rake do clube indicado, sem teto', () => {
    expect(calcularIndicacao(5, 1000)).toBe(50) // 5% de 1000 (rake do indicado) = 50
    expect(calcularIndicacao(5, 10000)).toBe(500) // 5% de 10000 = 500, sem teto
    expect(calcularIndicacao(10, 50000)).toBe(5000) // 10% de 50000 = 5000, sem teto
  })

  it('mais de uma indicação: cada uma usa o rake do seu próprio indicado, soma em R$', () => {
    // 3% de 1000 (indicado A) + 5% de 2000 (indicado B) = 30 + 100 = 130
    expect(calcularIndicacao(3, 1000) + calcularIndicacao(5, 2000)).toBe(130)
  })

  it('rake zero ou percentual zero dá bônus zero', () => {
    expect(calcularIndicacao(10, 0)).toBe(0)
    expect(calcularIndicacao(0, 1000)).toBe(0)
  })
})

describe('calcularWtr4Semanas', () => {
  it('razão das somas: soma Ganhos e soma Rake das semanas, divide uma vez só — não é média das razões semanais', () => {
    // Exemplo real conferido com o Cássio: W1 1000/-500, W2 250/-500, W3 700/200, W4 100/-230
    // Soma Rake = 2050, soma Ganhos = -1030 → -1030/2050 = -0,50244 (não -1,12857, que seria a média das razões)
    const atual = { player_result: -230, rake_total: 100 }
    const historico = [
      { player_result: 200, rake_total: 700 },
      { player_result: -500, rake_total: 250 },
      { player_result: -500, rake_total: 1000 },
    ]
    expect(calcularWtr4Semanas(row(atual), historico)).toBeCloseTo(-0.50244, 5)
  })

  it('ignora semana com rake zero, sem null nem divisão por zero', () => {
    const atual = { player_result: 100, rake_total: 500 }
    const historico = [{ player_result: 999, rake_total: 0 }]
    expect(calcularWtr4Semanas(row(atual), historico)).toBe(0.2) // só a semana atual conta: 100/500
  })

  it('sem nenhuma semana com rake, dá null', () => {
    expect(calcularWtr4Semanas(row({ player_result: 0, rake_total: 0 }), [])).toBeNull()
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

  it('Taxa Operacional desligada (taxa_op_ativo=false) não cobra nada, mesmo com % preenchido', () => {
    const r = row({ rake_total: 1000, rake_mtt: 400, rake_cash: 500, rake_spinup: 100 })
    const c = club({ fee_mtt_pct: 10, taxa_op_pct: 2, taxa_op_ativo: false, spinup_pct: 3 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.fee_operacional_valor).toBe(0)
    expect(resultado.fee_mtt_valor).toBe(40) // outras taxas continuam normais
  })

  it('Valor do Acerto = Rake Total + Ganhos do jogador + SpinUp (crédito) − Taxa cobrada', () => {
    const r = row({ rake_total: 1000, rake_mtt: 400, rake_cash: 500, rake_spinup: 100, player_result: -200 })
    const c = club({ fee_mtt_pct: 10, fee_cash_pct: 5, taxa_op_pct: 2, spinup_pct: 3 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    // fee = 400*10% (mtt) + 500*5% (cash) + 1000*2% (operacional, base = rake total) = 40 + 25 + 20 = 85
    // SpinUp (100*3%=3) NÃO entra na fee — é crédito do clube, soma no Acerto.
    expect(resultado.fee_spinup_valor).toBe(3)
    expect(resultado.fee_calculado).toBe(85)
    expect(resultado.valor_acerto).toBe(1000 + -200 + 3 - 85) // 718
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

  it('Regra vinculada no campo Rake Total serve de fallback pra Fee MTT e Fee Cash quando eles não têm regra própria', () => {
    const r = row({ rake_total: 1000, rake_mtt: 400, rake_cash: 500 })
    const c = club({ fee_mtt_pct: 10, fee_cash_pct: 5 }) // ignorados: Rake Total tem prioridade sobre o fixo
    const condicoesPorCampo = { ...CONDICOES_VAZIAS, rake_total: [condicao({ operador: '>', valor: 0, resultado_pct: 20 })] }
    const resultado = calcularAcerto(r, c, condicoesPorCampo, null)
    expect(resultado.fee_mtt_valor).toBe(80) // 400 * 20%, não os 10% fixos
    expect(resultado.fee_cash_valor).toBe(100) // 500 * 20%, não os 5% fixos
    expect(resultado.taxa_cash_pct_aplicada).toBe(20)
  })

  it('Regra própria de Fee Cash continua tendo prioridade sobre o fallback de Rake Total', () => {
    const r = row({ rake_total: 1000, rake_cash: 500 })
    const c = club()
    const condicoesPorCampo = {
      ...CONDICOES_VAZIAS,
      fee_cash: [condicao({ operador: '>', valor: 0, resultado_pct: 20 })],
      rake_total: [condicao({ operador: '>', valor: 0, resultado_pct: 50 })],
    }
    const resultado = calcularAcerto(r, c, condicoesPorCampo, null)
    expect(resultado.fee_cash_valor).toBe(100) // 500 * 20% (regra própria), não os 50% do fallback
  })
})

describe('calcularAcerto — outros tipos de cobrança', () => {
  it('taxa_fixa_variavel: fee fixo sobre o rake total', () => {
    const r = row({ rake_total: 1000, player_result: -100 })
    const c = club({ settlement_type: 'taxa_fixa_variavel', fee_mtt_pct: 10, taxa_op_ativo: false })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.fee_calculado).toBe(100)
    expect(resultado.valor_acerto).toBe(1000 - 100 - 100) // 800
  })

  it('taxa_fixa_variavel: Taxa Operacional (quando ligada) soma ADICIONAL sobre o Rake Total', () => {
    const r = row({ rake_total: 1000, player_result: -100 })
    const c = club({ settlement_type: 'taxa_fixa_variavel', fee_mtt_pct: 10, taxa_op_ativo: true, taxa_op_pct: 9 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.fee_operacional_valor).toBe(90) // 1000 * 9%
    expect(resultado.fee_calculado).toBe(190) // 100 (taxa fixa) + 90 (operacional)
    expect(resultado.valor_acerto).toBe(1000 - 100 - 190) // 710
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
    expect(resultado.rebate_calculado).toBe(50)
    expect(resultado.fee_calculado).toBe(150) // 1000*15%
    // Crypto Rebate não entra no valor_acerto — vira exibição separada
    // ("Acerto com Crypto"/"Desconto") na tela, não muda o Acerto guardado.
    expect(resultado.valor_acerto).toBe(150 - 50)
  })

  it('tipo de cobrança desconhecido não quebra, só zera o valor do acerto', () => {
    const r = row()
    const c = club({ settlement_type: 'tipo_que_nao_existe' })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.valor_acerto).toBe(0)
  })

  it('taxa_fixa_variavel: Regra vinculada no campo Rake Total substitui o fee_mtt_pct fixo', () => {
    const r = row({ rake_total: 1000, player_result: -100 })
    const c = club({ settlement_type: 'taxa_fixa_variavel', fee_mtt_pct: 10, taxa_op_ativo: false })
    const condicoesPorCampo = { ...CONDICOES_VAZIAS, rake_total: [condicao({ operador: '>', valor: 0, resultado_pct: 25 })] }
    const resultado = calcularAcerto(r, c, condicoesPorCampo, null)
    expect(resultado.fee_calculado).toBe(250) // 1000 * 25%, não os 10% fixos do cadastro
    expect(resultado.valor_acerto).toBe(1000 - 100 - 250)
  })

  it('weekly_usd: Regra vinculada no campo Rake Total substitui o fee_mtt_pct fixo', () => {
    const r = row({ rake_total: 1000 })
    const c = club({ settlement_type: 'weekly_usd', fee_mtt_pct: 15, rebate_pct: 5, crypto_rebate_pct: 2 })
    const condicoesPorCampo = { ...CONDICOES_VAZIAS, rake_total: [condicao({ operador: '>', valor: 0, resultado_pct: 20 })] }
    const resultado = calcularAcerto(r, c, condicoesPorCampo, null)
    expect(resultado.fee_calculado).toBe(200) // 1000 * 20%, não os 15% fixos do cadastro
    expect(resultado.rebate_calculado).toBe(50)
    expect(resultado.valor_acerto).toBe(200 - 50)
  })
})

describe('calcularAcerto — Taxa da Liga', () => {
  it('sem Taxa da Liga configurada (parâmetro omitido): não desconta nada', () => {
    const r = row({ rake_total: 1000, rake_spinup: 100, player_result: -100 })
    const c = club({ settlement_type: 'taxa_dinamica' })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null)
    expect(resultado.taxa_liga_valor).toBe(0)
  })

  it('% fixo do cadastro da Liga: incide sobre Rake Total + SpinUp Rake, desconta do Valor do Acerto', () => {
    const r = row({ rake_total: 1000, rake_mtt: 0, rake_cash: 0, rake_spinup: 100, player_result: 0 })
    const c = club({ settlement_type: 'taxa_dinamica', fee_mtt_pct: 0, fee_cash_pct: 0, taxa_op_ativo: false, spinup_pct: 0 })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null, { pctFixo: 10, condicoes: [] })
    expect(resultado.taxa_liga_valor).toBe(110) // (1000 + 100) * 10%
    expect(resultado.valor_acerto).toBe(1000 - 110) // rake_total + ganhos(0) - fee(0) - taxa_liga
  })

  it('% fixo do cadastro manda mesmo com Regra de Faixa vinculada à Liga', () => {
    const r = row({ rake_total: 1000, rake_mtt: 0, rake_cash: 0, rake_spinup: 0, player_result: 0 })
    const c = club({ settlement_type: 'taxa_dinamica', fee_mtt_pct: 0, fee_cash_pct: 0, taxa_op_ativo: false, spinup_pct: 0 })
    const condicoesTaxaLiga = [condicao({ operador: '>', valor: 0, resultado_pct: 5 })]
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null, { pctFixo: 10, condicoes: condicoesTaxaLiga })
    expect(resultado.taxa_liga_valor).toBe(100) // 1000 * 10% (cadastro), não os 5% da Regra
  })

  it('Regra de Faixa vinculada à Liga só entra quando o cadastro está sem % fixo', () => {
    const r = row({ rake_total: 1000, rake_mtt: 0, rake_cash: 0, rake_spinup: 0, player_result: 0 })
    const c = club({ settlement_type: 'taxa_dinamica', fee_mtt_pct: 0, fee_cash_pct: 0, taxa_op_ativo: false, spinup_pct: 0 })
    const condicoesTaxaLiga = [condicao({ operador: '>', valor: 0, resultado_pct: 5 })]
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null, { pctFixo: null, condicoes: condicoesTaxaLiga })
    expect(resultado.taxa_liga_valor).toBe(50) // 1000 * 5%, cadastro vazio cai pra Regra
  })

  it('tipo de cobrança desconhecido: não aplica Taxa da Liga (fallback já zera tudo)', () => {
    const r = row({ rake_total: 1000, rake_spinup: 100 })
    const c = club({ settlement_type: 'tipo_que_nao_existe' })
    const resultado = calcularAcerto(r, c, CONDICOES_VAZIAS, null, { pctFixo: 10, condicoes: [] })
    expect(resultado.taxa_liga_valor).toBe(0)
    expect(resultado.valor_acerto).toBe(0)
  })
})

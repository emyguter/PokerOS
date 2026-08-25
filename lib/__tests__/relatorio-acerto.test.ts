import { describe, it, expect } from 'vitest'
import { resolverLayout, ehObrigatorio, corrigirValorCrypto, LAYOUT_PADRAO, CAMPOS_OBRIGATORIOS } from '../relatorio-acerto'

describe('corrigirValorCrypto', () => {
  it('exemplo exato da planilha do Cássio: -7.911,43 com 3% dá -7.681,00', () => {
    expect(corrigirValorCrypto(-7911.43, 3)).toBeCloseTo(-7681, 2)
  })
  it('pct 0 (clube sem Crypto Rebate) devolve o valor sem alteração', () => {
    expect(corrigirValorCrypto(-7911.43, 0)).toBe(-7911.43)
  })
})

describe('ehObrigatorio', () => {
  it('reconhece todos os campos que sempre aparecem (incluindo Indicação/Lançamentos/Dívidas)', () => {
    for (const campo of CAMPOS_OBRIGATORIOS) expect(ehObrigatorio(campo)).toBe(true)
    expect(ehObrigatorio('indicacao')).toBe(true)
    expect(ehObrigatorio('lancamentos_periodo')).toBe(true)
    expect(ehObrigatorio('dividas_acordos')).toBe(true)
  })
  it('campo opcional não é obrigatório', () => {
    expect(ehObrigatorio('rebate')).toBe(false)
  })
})

describe('resolverLayout', () => {
  it('sem config nenhuma, cai no layout padrão inteiro visível', () => {
    const resolvido = resolverLayout(null)
    expect(resolvido.map((c) => c.campo)).toEqual(LAYOUT_PADRAO)
    expect(resolvido.every((c) => c.visivel)).toBe(true)
  })

  it('respeita a ordem vinda da config', () => {
    const resolvido = resolverLayout([
      { campo: 'clube', ordem: 0, visivel: true },
      { campo: 'semana', ordem: 1, visivel: true },
    ])
    expect(resolvido[0].campo).toBe('clube')
    expect(resolvido[1].campo).toBe('semana')
  })

  it('esconde campo opcional marcado como não visível', () => {
    const resolvido = resolverLayout([{ campo: 'rebate', ordem: 0, visivel: false }])
    const rebate = resolvido.find((c) => c.campo === 'rebate')
    expect(rebate?.visivel).toBe(false)
  })

  it('nunca deixa campo obrigatório escondido, mesmo se a config mandar', () => {
    const resolvido = resolverLayout([{ campo: 'rake_total', ordem: 0, visivel: false }])
    const rakeTotal = resolvido.find((c) => c.campo === 'rake_total')
    expect(rakeTotal?.visivel).toBe(true)
  })

  it('completa no final com campo que a config não conhece', () => {
    const resolvido = resolverLayout([{ campo: 'clube', ordem: 0, visivel: true }])
    expect(resolvido.length).toBe(LAYOUT_PADRAO.length)
    expect(resolvido.map((c) => c.campo)).toContain('dividas_acordos')
  })

  it('ignora campo desconhecido na config', () => {
    const resolvido = resolverLayout([{ campo: 'campo_que_nao_existe', ordem: 0, visivel: true }])
    expect(resolvido.map((c) => c.campo)).not.toContain('campo_que_nao_existe')
  })
})

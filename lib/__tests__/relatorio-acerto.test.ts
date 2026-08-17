import { describe, it, expect } from 'vitest'
import { resolverLayout, ehObrigatorio, LAYOUT_PADRAO, CAMPOS_OBRIGATORIOS } from '../relatorio-acerto'

describe('ehObrigatorio', () => {
  it('reconhece os 8 campos que sempre aparecem', () => {
    for (const campo of CAMPOS_OBRIGATORIOS) expect(ehObrigatorio(campo)).toBe(true)
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

import { describe, it, expect } from 'vitest'
import { agregarPagamentos, corDiferenca } from '../pagamentos'

function acerto(overrides: Partial<Parameters<typeof agregarPagamentos>[0][number]> = {}) {
  return { id: 'acerto-1', club_external_id: '123', club_name: 'Clube Teste', valor_acerto: 1000, ...overrides }
}

describe('agregarPagamentos', () => {
  it('sem pagamentos, diferença = valor do acerto inteiro', () => {
    const [r] = agregarPagamentos([acerto()], [])
    expect(r.valor_pago).toBe(0)
    expect(r.diferenca).toBe(1000)
    expect(r.envios).toEqual([])
  })

  it('crédito soma, débito subtrai — mesma regra do resto do app', () => {
    const pagamentos = [
      { id: 'p1', acerto_id: 'acerto-1', natureza: 'credito' as const, valor: 400, data_lancamento: '2026-08-10' },
      { id: 'p2', acerto_id: 'acerto-1', natureza: 'debito' as const, valor: 100, data_lancamento: '2026-08-11' },
    ]
    const [r] = agregarPagamentos([acerto()], pagamentos)
    expect(r.valor_pago).toBe(300) // 400 - 100
    expect(r.diferenca).toBe(700) // 1000 - 300
    expect(r.envios.map((e) => e.valor_assinado)).toEqual([400, -100])
  })

  it('Acerto quitado (valor pago = valor do acerto) dá diferença 0', () => {
    const pagamentos = [{ id: 'p1', acerto_id: 'acerto-1', natureza: 'credito' as const, valor: 1000, data_lancamento: '2026-08-10' }]
    const [r] = agregarPagamentos([acerto()], pagamentos)
    expect(r.diferenca).toBe(0)
  })

  it('pagamento de outro acerto não entra na lista desse clube', () => {
    const pagamentos = [{ id: 'p1', acerto_id: 'acerto-outro', natureza: 'credito' as const, valor: 999, data_lancamento: '2026-08-10' }]
    const [r] = agregarPagamentos([acerto()], pagamentos)
    expect(r.valor_pago).toBe(0)
    expect(r.envios).toEqual([])
  })

  it('múltiplos clubes ficam separados corretamente', () => {
    const acertos = [acerto({ id: 'a1', club_name: 'Clube A' }), acerto({ id: 'a2', club_name: 'Clube B', valor_acerto: 500 })]
    const pagamentos = [
      { id: 'p1', acerto_id: 'a1', natureza: 'credito' as const, valor: 200, data_lancamento: '2026-08-10' },
      { id: 'p2', acerto_id: 'a2', natureza: 'credito' as const, valor: 500, data_lancamento: '2026-08-10' },
    ]
    const resultado = agregarPagamentos(acertos, pagamentos)
    expect(resultado.find((r) => r.acerto_id === 'a1')?.diferenca).toBe(800)
    expect(resultado.find((r) => r.acerto_id === 'a2')?.diferenca).toBe(0)
  })
})

describe('corDiferenca', () => {
  it('quitado (diferença ~0) independe da perspectiva', () => {
    expect(corDiferenca(0, 'suporte')).toBe('quitado')
    expect(corDiferenca(0.001, 'financeiro')).toBe('quitado')
  })

  it('Suporte: diferença positiva (clube vai receber) é azul, negativa (clube precisa pagar) é vermelho', () => {
    expect(corDiferenca(500, 'suporte')).toBe('azul')
    expect(corDiferenca(-500, 'suporte')).toBe('vermelho')
  })

  it('Financeiro: mesma diferença dá cor invertida (perspectiva da liga, não do clube)', () => {
    expect(corDiferenca(500, 'financeiro')).toBe('azul')
    expect(corDiferenca(-500, 'financeiro')).toBe('vermelho')
  })
})

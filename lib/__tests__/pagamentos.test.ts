import { describe, it, expect } from 'vitest'
import { agregarPagamentos, corDiferenca, diferencaDaLiga } from '../pagamentos'

// valor_acerto negativo = o clube deve (caso mais comum no Controle de
// Pagamentos) — mesma convenção usada no resto do app (positivo = clube vai
// receber, ver corDiferenca/diferencaDaLiga).
function acerto(overrides: Partial<Parameters<typeof agregarPagamentos>[0][number]> = {}) {
  return { id: 'acerto-1', club_external_id: '123', club_name: 'Clube Teste', valor_acerto: -1000, ...overrides }
}

describe('agregarPagamentos', () => {
  it('sem pagamentos, diferença = valor do acerto inteiro', () => {
    const [r] = agregarPagamentos([acerto()], [])
    expect(r.valor_pago).toBe(0)
    expect(r.diferenca).toBe(-1000)
    expect(r.envios).toEqual([])
  })

  it('crédito soma, débito subtrai no valor pago — mesma regra do resto do app', () => {
    const pagamentos = [
      { id: 'p1', acerto_id: 'acerto-1', natureza: 'credito' as const, valor: 400, data_lancamento: '2026-08-10' },
      { id: 'p2', acerto_id: 'acerto-1', natureza: 'debito' as const, valor: 100, data_lancamento: '2026-08-11' },
    ]
    const [r] = agregarPagamentos([acerto()], pagamentos)
    expect(r.valor_pago).toBe(300) // 400 - 100
    expect(r.diferenca).toBe(-700) // -1000 + 300 — o Envio soma por cima da dívida
    expect(r.envios.map((e) => e.valor_assinado)).toEqual([400, -100])
  })

  it('Acerto quitado (Envio cobre o Valor do Acerto) dá diferença 0', () => {
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
    const acertos = [acerto({ id: 'a1', club_name: 'Clube A' }), acerto({ id: 'a2', club_name: 'Clube B', valor_acerto: -500 })]
    const pagamentos = [
      { id: 'p1', acerto_id: 'a1', natureza: 'credito' as const, valor: 200, data_lancamento: '2026-08-10' },
      { id: 'p2', acerto_id: 'a2', natureza: 'credito' as const, valor: 500, data_lancamento: '2026-08-10' },
    ]
    const resultado = agregarPagamentos(acertos, pagamentos)
    expect(resultado.find((r) => r.acerto_id === 'a1')?.diferenca).toBe(-800)
    expect(resultado.find((r) => r.acerto_id === 'a2')?.diferenca).toBe(0)
  })
})

describe('corDiferenca', () => {
  it('diferença ~0 é quitado', () => {
    expect(corDiferenca(0)).toBe('quitado')
    expect(corDiferenca(0.001)).toBe('quitado')
  })

  it('positiva é azul (quem está olhando vai receber), negativa é vermelho (precisa pagar)', () => {
    expect(corDiferenca(500)).toBe('azul')
    expect(corDiferenca(-500)).toBe('vermelho')
  })
})

describe('diferencaDaLiga', () => {
  it('espelha a diferença do clube (Suporte) pra visão da liga (Financeiro)', () => {
    expect(diferencaDaLiga(500)).toBe(-500)
    expect(diferencaDaLiga(-500)).toBe(500)
  })

  it('sinal e cor ficam diferentes entre as duas visões pro mesmo Acerto', () => {
    const diferencaDoClube = 500 // clube vai receber
    expect(corDiferenca(diferencaDoClube)).toBe('azul')
    expect(corDiferenca(diferencaDaLiga(diferencaDoClube))).toBe('vermelho') // liga precisa pagar
  })
})

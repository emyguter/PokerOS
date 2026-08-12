import { describe, it, expect } from 'vitest'
import { campoFromCondicoes, formatIndicadorNome } from '../indicadores'
import type { RegraCondicaoForm } from '../types'

function condicao(indicador_ids: string[]): RegraCondicaoForm {
  return { indicador_ids, operador: '>', valor: 0, resultado_pct: 10, is_fallback: false }
}

describe('campoFromCondicoes', () => {
  const nomes = new Map([
    ['id-rake', 'rake'],
    ['id-rake-cash', 'rake_cash'],
    ['id-rake-mtt', 'rake_mtt'],
    ['id-rake-spinup', 'rake_spinup'],
    ['id-ganhos', 'resultado_jogador'],
  ])

  it('Rake Cash aponta pra Fee Cash', () => {
    expect(campoFromCondicoes([condicao(['id-rake-cash'])], nomes)).toBe('fee_cash')
  })

  it('Rake MTT aponta pra Fee MTT', () => {
    expect(campoFromCondicoes([condicao(['id-rake-mtt'])], nomes)).toBe('fee_mtt')
  })

  it('Rake Spinup aponta pra SpinUp', () => {
    expect(campoFromCondicoes([condicao(['id-rake-spinup'])], nomes)).toBe('spinup')
  })

  it('Rake (total) também aponta pra Fee Cash — regressão do bug "Rake+Ganhos" não reconhecido', () => {
    // Fee Cash é a única taxa cuja % variável multiplica sobre o Rake Total
    // (ver lib/acertos-engine.ts) — uma condição só com "Rake", ou somando
    // "Rake + Ganhos" (usado pro WtR), precisa continuar apontando pra
    // fee_cash. Isso já quebrou de verdade: o vínculo ficava sem campo e o
    // motor de acertos pulava a regra inteira.
    expect(campoFromCondicoes([condicao(['id-rake'])], nomes)).toBe('fee_cash')
    expect(campoFromCondicoes([condicao(['id-rake', 'id-ganhos'])], nomes)).toBe('fee_cash')
  })

  it('indicador genérico sem taxa associada (ex: só Ganhos) não aponta pra nenhum campo', () => {
    expect(campoFromCondicoes([condicao(['id-ganhos'])], nomes)).toBeNull()
  })

  it('usa a primeira condição/termo reconhecível, em ordem', () => {
    const condicoes = [condicao(['id-ganhos']), condicao(['id-rake-mtt'])]
    expect(campoFromCondicoes(condicoes, nomes)).toBe('fee_mtt')
  })

  it('sem condições, retorna null', () => {
    expect(campoFromCondicoes([], nomes)).toBeNull()
  })
})

describe('formatIndicadorNome', () => {
  it('usa a descrição quando existe', () => {
    expect(formatIndicadorNome('rake_cash', 'Rake Cash')).toBe('Rake Cash')
  })
  it('cai pro nome técnico quando não há descrição', () => {
    expect(formatIndicadorNome('rake_cash', null)).toBe('rake_cash')
    expect(formatIndicadorNome('rake_cash')).toBe('rake_cash')
  })
})

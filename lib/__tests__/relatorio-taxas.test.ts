import { describe, it, expect } from 'vitest'
import { formatCampo } from '../relatorio-taxas'

describe('formatCampo', () => {
  it('sem faixa e sem fixo: traço', () => {
    expect(formatCampo(null, undefined)).toEqual({ valor: '—', variavel: false })
  })
  it('sem faixa, com fixo: mostra o % fixo do cadastro', () => {
    expect(formatCampo(8.5, undefined)).toEqual({ valor: '8.5%', variavel: false })
  })
  it('com faixa de valor único (min === max): mostra só um %, marcado como variável', () => {
    expect(formatCampo(10, { min: 15, max: 15 })).toEqual({ valor: '15%', variavel: true })
  })
  it('com faixa de verdade: mostra min–max, marcado como variável (ignora o fixo)', () => {
    expect(formatCampo(10, { min: 5, max: 15 })).toEqual({ valor: '5% – 15%', variavel: true })
  })
})

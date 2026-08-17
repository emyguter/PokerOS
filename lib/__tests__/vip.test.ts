import { describe, it, expect } from 'vitest'
import { corVip, LIMITES_VIP } from '../vip'

describe('corVip', () => {
  it('branco quando bem abaixo do limite', () => {
    expect(corVip(0, 20)).toBe('branco')
    expect(corVip(10, 20)).toBe('branco')
  })

  it('amarelo a partir de 80% do limite', () => {
    expect(corVip(16, 20)).toBe('amarelo')
    expect(corVip(15, 20)).toBe('branco')
  })

  it('vermelho ao atingir ou passar o limite', () => {
    expect(corVip(20, 20)).toBe('vermelho')
    expect(corVip(25, 20)).toBe('vermelho')
  })

  it('respeita os limites reais de cada tipo (Silver 20 / Black 10 / Platinum 5)', () => {
    expect(corVip(LIMITES_VIP.silver, LIMITES_VIP.silver)).toBe('vermelho')
    expect(corVip(8, LIMITES_VIP.black)).toBe('amarelo')
    expect(corVip(4, LIMITES_VIP.platinum)).toBe('amarelo')
    expect(corVip(3, LIMITES_VIP.platinum)).toBe('branco')
  })
})

import { describe, it, expect } from 'vitest'
import { corVip, limiteVipDoClube } from '../vip'

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

  it('branco quando não há limite configurado (0)', () => {
    expect(corVip(5, 0)).toBe('branco')
  })
})

describe('limiteVipDoClube', () => {
  it('lê a coluna certa por tipo', () => {
    const clube = { limite_vip_silver: 20, limite_vip_black: 10, limite_vip_platinum: 5 }
    expect(limiteVipDoClube(clube, 'silver')).toBe(20)
    expect(limiteVipDoClube(clube, 'black')).toBe(10)
    expect(limiteVipDoClube(clube, 'platinum')).toBe(5)
  })

  it('trata null como 0 (sem limite configurado)', () => {
    const clube = { limite_vip_silver: null, limite_vip_black: null, limite_vip_platinum: null }
    expect(limiteVipDoClube(clube, 'silver')).toBe(0)
  })
})

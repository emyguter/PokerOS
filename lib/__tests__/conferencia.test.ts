import { describe, it, expect } from 'vitest'
import { valoresBatem } from '../conferencia'

describe('valoresBatem', () => {
  it('bate quando os valores são iguais', () => {
    expect(valoresBatem(1000, 1000)).toBe(true)
  })

  it('bate com diferença de arredondamento mínima', () => {
    expect(valoresBatem(1000, 1000.001)).toBe(true)
  })

  it('não bate quando a diferença é relevante', () => {
    expect(valoresBatem(1000, 1000.5)).toBe(false)
    expect(valoresBatem(1000, 950)).toBe(false)
  })
})

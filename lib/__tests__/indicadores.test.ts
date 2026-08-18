import { describe, it, expect } from 'vitest'
import { formatIndicadorNome } from '../indicadores'

describe('formatIndicadorNome', () => {
  it('usa a descrição quando existe', () => {
    expect(formatIndicadorNome('rake_cash', 'Rake Cash')).toBe('Rake Cash')
  })
  it('cai pro nome técnico quando não há descrição', () => {
    expect(formatIndicadorNome('rake_cash', null)).toBe('rake_cash')
    expect(formatIndicadorNome('rake_cash')).toBe('rake_cash')
  })
})

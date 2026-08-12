import { describe, it, expect } from 'vitest'
import { inicioSemanaAtual, calcularStoplossAtual, somarHistorico, type ClubeBaseStoploss, type HistoricoRow } from '../stoploss'

// Âncora conhecida: 2024-01-01 é uma segunda-feira (verificável em qualquer
// calendário) — todos os testes de virada de semana partem daqui, somando/
// subtraindo dias, em vez de depender de "decorar" um dia da semana qualquer.
const SEGUNDA_BRL_2H_UTC = '2024-01-01T05:00:00.000Z' // segunda 01/01, 02:00 BRL (UTC-3)
const SEGUNDA_ANTERIOR_BRL_2H_UTC = '2023-12-25T05:00:00.000Z' // a segunda de 7 dias antes

describe('inicioSemanaAtual', () => {
  it('segunda-feira depois da hora de virada: começo da semana é hoje', () => {
    // 03:00 BRL de segunda (depois da virada às 2h)
    const agora = new Date('2024-01-01T06:00:00.000Z')
    expect(inicioSemanaAtual(2, agora).toISOString()).toBe(SEGUNDA_BRL_2H_UTC)
  })

  it('segunda-feira antes da hora de virada: a semana ainda não virou, conta a segunda passada', () => {
    // 01:00 BRL de segunda (antes da virada às 2h)
    const agora = new Date('2024-01-01T04:00:00.000Z')
    expect(inicioSemanaAtual(2, agora).toISOString()).toBe(SEGUNDA_ANTERIOR_BRL_2H_UTC)
  })

  it('segunda-feira exatamente na hora de virada já conta como virada', () => {
    const agora = new Date(SEGUNDA_BRL_2H_UTC)
    expect(inicioSemanaAtual(2, agora).toISOString()).toBe(SEGUNDA_BRL_2H_UTC)
  })

  it('no meio da semana (quarta), volta pra segunda da mesma semana', () => {
    const agora = new Date('2024-01-03T12:00:00.000Z') // quarta, 09:00 BRL
    expect(inicioSemanaAtual(2, agora).toISOString()).toBe(SEGUNDA_BRL_2H_UTC)
  })

  it('no fim da semana (domingo), ainda é a mesma semana que começou na segunda', () => {
    const agora = new Date('2024-01-07T12:00:00.000Z') // domingo, 09:00 BRL
    expect(inicioSemanaAtual(2, agora).toISOString()).toBe(SEGUNDA_BRL_2H_UTC)
  })

  it('hora de virada 0 (meia-noite BRL, ex: Sul HG): domingo à noite ainda é semana anterior', () => {
    // 2024-01-01T02:00:00Z = 2023-12-31T23:00:00 BRL (domingo às 23h) — ainda não virou meia-noite
    const agora = new Date('2024-01-01T02:00:00.000Z')
    expect(inicioSemanaAtual(0, agora).toISOString()).toBe('2023-12-25T03:00:00.000Z')
  })

  it('hora de virada 0: logo depois da meia-noite BRL de segunda já é a semana nova', () => {
    // 2024-01-01T03:01:00Z = 2024-01-01T00:01:00 BRL (segunda, 1 min depois da meia-noite)
    const agora = new Date('2024-01-01T03:01:00.000Z')
    expect(inicioSemanaAtual(0, agora).toISOString()).toBe('2024-01-01T03:00:00.000Z')
  })
})

function clube(overrides: Partial<ClubeBaseStoploss> = {}): ClubeBaseStoploss {
  return {
    id: 'club-1',
    stoploss_inicial: 5000,
    caucao_atual: 2000,
    ratio_caucao_stoploss: 1,
    hora_virada_semana: 2,
    ...overrides,
  }
}

describe('calcularStoplossAtual', () => {
  it('formula base: inicial + caução × ratio + soma do histórico', () => {
    const c = clube({ stoploss_inicial: 5000, caucao_atual: 2000, ratio_caucao_stoploss: 1.5 })
    expect(calcularStoplossAtual(c, 300)).toBe(5000 + 2000 * 1.5 + 300)
  })

  it('ratio padrão é 1x quando não definido', () => {
    const c = clube({ stoploss_inicial: 1000, caucao_atual: 500, ratio_caucao_stoploss: null })
    expect(calcularStoplossAtual(c, 0)).toBe(1500)
  })

  it('campos nulos viram 0 em vez de quebrar (NaN)', () => {
    const c = clube({ stoploss_inicial: null, caucao_atual: null })
    expect(calcularStoplossAtual(c, 0)).toBe(0)
  })
})

function historico(overrides: Partial<HistoricoRow> = {}): HistoricoRow {
  return {
    clube_id: 'club-1',
    valor_delta: 100,
    escopo: 'permanente',
    criado_em: '2023-12-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('somarHistorico', () => {
  const rows: HistoricoRow[] = [
    historico({ valor_delta: 100, escopo: 'permanente', criado_em: '2023-12-01T00:00:00.000Z' }),
    historico({ valor_delta: 50, escopo: 'semanal', criado_em: SEGUNDA_BRL_2H_UTC }), // criado na semana de 01/01
    historico({ valor_delta: 30, escopo: 'semanal', criado_em: '2023-12-28T00:00:00.000Z' }), // criado na semana de 25/12
  ]

  it('ajuste permanente sempre soma, ajuste semanal só soma na semana em que foi criado', () => {
    // "agora" é quarta 03/01 — mesma semana do ajuste semanal de 50, semana
    // seguinte à do ajuste semanal de 30 (que já expirou).
    const asOf = new Date('2024-01-03T12:00:00.000Z')
    expect(somarHistorico(rows, 2, asOf)).toBe(100 + 50)
  })

  it('reconstrói como estava numa data passada: ignora o que ainda não tinha acontecido, usa a semana daquela data', () => {
    // "agora" é sábado 30/12 — antes do ajuste de 50 existir, e ainda dentro
    // da semana do ajuste de 30 (25/12), que nesse ponto do tempo ainda valia.
    const asOf = new Date('2023-12-30T12:00:00.000Z')
    expect(somarHistorico(rows, 2, asOf)).toBe(100 + 30)
  })

  it('sem histórico nenhum, soma é 0', () => {
    expect(somarHistorico([], 2, new Date())).toBe(0)
  })
})

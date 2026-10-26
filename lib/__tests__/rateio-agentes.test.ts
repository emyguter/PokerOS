import { describe, it, expect } from 'vitest'
import { acharColunasTaxa, propagarParaSuperagentes, type GrupoRateio } from '../rateio-agentes'

// Gabarito: planilha manual do Cássio "SUL HG ACERTOS 03a09/08" (abas BASE
// SUL HG, GERENCIAMENTO, LP e uma aba por Agente).

describe('acharColunasTaxa', () => {
  // Sub-cabeçalho do relatório Superagente/Agente/Jogador do PPPoker, a
  // partir do bloco "Ganhos do clube" (índice 27 = coluna AB).
  const sub: string[] = []
  sub[27] = 'Geral'; sub[28] = 'Taxa'; sub[29] = 'Taxa (jogos PPST)'; sub[30] = 'Taxa (jogos não PPST)'
  sub[31] = 'Taxa (jogos PPSR)'; sub[32] = 'Taxa (jogos não PPSR)'; sub[33] = 'Buy-in de SPINUP'
  sub[43] = 'Taxa do Jackpot'; sub[44] = 'Prêmios Jackpot'

  it('pega só as 4 colunas de Taxa (sem Jackpot/SPINUP/total)', () => {
    expect(acharColunasTaxa(sub, 27, 46)).toEqual([29, 30, 31, 32])
  })

  it('não acha nada fora do bloco', () => {
    expect(acharColunasTaxa(sub, 40, 46)).toEqual([])
    expect(acharColunasTaxa(sub, -1, 46)).toEqual([])
  })
})

describe('propagarParaSuperagentes — caso SUL HG', () => {
  // [jogador, agente (null = direto no superagente), superagente, rake (Taxa), ganhos gerais]
  const jogadores: [string, string | null, string, number, number][] = [
    ['5869211', '9817750', '13118036', 15, -100],
    ['6358199', '9817750', '13118036', 64.5, -430],
    ['10080332', '9817750', '13118036', 60, -400],
    ['10478857', '9817750', '13118036', 109.5, 5470],
    ['756420', '9817750', '13118036', 12, -80],
    ['9817750', '9817750', '13118036', 60, -400],
    ['12916910', '12034210', '13118036', 359.3, 1579.93],
    ['11272338', '12034210', '13118036', 228.95, -869.4],
    ['11777352', '12034210', '13118036', 1583.27, 2920.8],
    ['13480879', null, '11230648', 22.5, 102],
    ['13467973', null, '11230648', 90, -600],
    ['2794574', null, '11230648', 90, -600],
    ['1862234', '1862234', '11230648', 58.66, -700.75],
    ['9698237', '9698237', '10696013', 60, -400],
  ]

  // Cadastro: Agente -> Superagente. Bianico. (11230648) e Stars Poker
  // (10696013) ficam abaixo do TT/LP (13118036) — no PPPoker a coluna
  // Superagente traz o caminho "TT/LP/Bianico".
  const superDe = new Map<string, string | null>([
    ['9817750', '13118036'], // StoicWarrior
    ['12034210', '13118036'], // ticarlos.
    ['1862234', '11230648'], // jcana -> Bianico.
    ['9698237', '10696013'], // jejelindinho -> Stars Poker
    ['11230648', '13118036'], // Bianico. -> TT/LP
    ['10696013', '13118036'], // Stars Poker -> TT/LP
    ['13118036', null],
  ])

  // Mesmo agrupamento do processarAcertosAgentes: agente efetivo = agente ?? superagente.
  function gruposBase(ordem: typeof jogadores): GrupoRateio[] {
    const m = new Map<string, GrupoRateio>()
    for (const [, ag, sa, rake, ganhos] of ordem) {
      const id = ag ?? sa
      const g = m.get(id) ?? { agente_id: id, clube_id: 'sul-hg', rake_total: 0, player_result: 0 }
      g.rake_total += rake; g.player_result += ganhos
      m.set(id, g)
    }
    return [...m.values()]
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  const esperado: Record<string, { rake: number; ganhos: number }> = {
    '9817750': { rake: 321, ganhos: 4060 }, // StoicWarrior
    '12034210': { rake: 2171.52, ganhos: 3631.33 }, // ticarlos.
    '11230648': { rake: 261.16, ganhos: -1798.75 }, // Bianico. (inclui jcana)
    '10696013': { rake: 60, ganhos: -400 }, // Stars Poker
    '13118036': { rake: 2813.68, ganhos: 5492.58 }, // TT/LP = total do clube (aba LP)
  }

  it('bate com a planilha do Cássio', () => {
    const out = propagarParaSuperagentes(gruposBase(jogadores), superDe)
    for (const [id, e] of Object.entries(esperado)) {
      const g = out.get(`${id}:sul-hg`)!
      expect(r2(g.rake_total)).toBe(e.rake)
      expect(r2(g.player_result)).toBe(e.ganhos)
    }
  })

  it('não depende da ordem dos jogadores', () => {
    const out = propagarParaSuperagentes(gruposBase([...jogadores].reverse()), superDe)
    expect(r2(out.get('13118036:sul-hg')!.rake_total)).toBe(2813.68)
    expect(r2(out.get('11230648:sul-hg')!.rake_total)).toBe(261.16)
  })

  it('não entra em loop com ciclo no cadastro', () => {
    const ciclo = new Map<string, string | null>([['a', 'b'], ['b', 'a']])
    const out = propagarParaSuperagentes([{ agente_id: 'a', clube_id: null, rake_total: 10, player_result: 0 }], ciclo)
    expect(out.get('a:sem_clube')!.rake_total).toBe(10)
    expect(out.get('b:sem_clube')!.rake_total).toBe(10)
  })
})

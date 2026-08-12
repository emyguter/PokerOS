import type { CampoClube, RegraCondicaoForm } from './types'

export function formatIndicadorNome(nome: string, descricao?: string | null): string {
  return descricao || nome
}

// Indicador usado na condição já diz qual taxa do clube a regra substitui —
// Rake Cash = Fee Cash, Rake MTT = Fee MTT, Rake Spinup = SpinUp. Rake (Rake
// Total = Rake MTT + Rake Cash) também vira Fee Cash: é a única das 4 taxas
// cuja % variável multiplica sobre o Rake Total, e não sobre a própria base
// (ver comentário em calcularAcerto/acertos-engine.ts) — então uma condição
// tipo "Rake + Ganhos" (WtR) também aponta pra Fee Cash. Indicador genérico
// (Ganhos sozinho, Fee Total, Mãos...) não aponta pra nenhuma taxa específica,
// então não dá pra inferir (vínculo fica sem campo).
const CAMPO_POR_INDICADOR: Record<string, CampoClube> = {
  rake: 'fee_cash',
  rake_cash: 'fee_cash',
  rake_mtt: 'fee_mtt',
  rake_spinup: 'spinup',
}

export function campoFromCondicoes(condicoes: RegraCondicaoForm[], nomePorId: Map<string, string>): CampoClube | null {
  for (const c of condicoes) {
    for (const id of c.indicador_ids) {
      const nome = nomePorId.get(id)
      if (nome && CAMPO_POR_INDICADOR[nome]) return CAMPO_POR_INDICADOR[nome]
    }
  }
  return null
}

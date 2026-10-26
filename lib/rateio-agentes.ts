// Regras puras (sem Supabase) do rateio de rakeback dos Agentes — separadas
// pra poder testar contra a planilha manual do Cássio (caso SUL HG,
// semana 03 a 09/08/2026).

// Sub-colunas do bloco "Ganhos do clube" que são Rake de verdade. A planilha
// manual do Cássio usa só "Taxa" = Taxa (jogos PPST) + Taxa (jogos não
// PPST) + Taxa (jogos PPSR) + Taxa (jogos não PPSR) — mesma regra já usada
// na aba "Geral da liga" (parsePPPoker: rakeMtt + rakeCash). Somar o bloco
// inteiro de "Ganhos do clube" puxava junto Taxa do Jackpot, SPINUP,
// Caribbean, CRASH etc. e inflava o Rake do Agente (no SUL HG: 2.942,68 em
// vez de 2.813,68 — os 129,00 de Taxa do Jackpot).
export const COLUNAS_TAXA_RAKE = [
  "Taxa (jogos PPST)",
  "Taxa (jogos não PPST)",
  "Taxa (jogos PPSR)",
  "Taxa (jogos não PPSR)",
] as const;

// Índices das colunas de Taxa na linha de sub-cabeçalho, procurando só
// dentro do bloco [inicioBloco, fimBloco) — "Ganhos do clube". Vazio quando
// o relatório não traz essa quebra (quem chama cai no comportamento antigo).
export function acharColunasTaxa(subHeader: unknown[], inicioBloco: number, fimBloco: number): number[] {
  if (inicioBloco < 0) return [];
  const idxs: number[] = [];
  for (let c = inicioBloco; c < fimBloco; c++) {
    const v = String(subHeader[c] ?? "").trim();
    if ((COLUNAS_TAXA_RAKE as readonly string[]).includes(v)) idxs.push(c);
  }
  return idxs;
}

export interface GrupoRateio {
  agente_id: string;
  clube_id: string | null;
  rake_total: number;
  player_result: number;
}

// Repasse pra cima na hierarquia: cada grupo-base (Agente efetivo x Clube)
// soma em TODOS os ancestrais (Superagente, o Superagente dele, ...), não só
// no pai direto. Antes era 1 nível só e dependia da ordem em que os grupos
// vinham do banco (um Superagente processado antes do Agente dele perdia o
// rake do Agente na subida). Caso SUL HG: jcana -> Bianico. -> TT/LP — o
// TT/LP precisa fechar com o Rake total do clube (2.813,68), igual à aba LP
// da planilha do Cássio.
export function propagarParaSuperagentes(
  base: GrupoRateio[],
  superagentePorAgente: Map<string, string | null>,
  profundidadeMax = 10
): Map<string, GrupoRateio> {
  const chave = (agenteId: string, clubeId: string | null) => `${agenteId}:${clubeId ?? "sem_clube"}`;
  const out = new Map<string, GrupoRateio>();
  const somar = (agenteId: string, g: GrupoRateio) => {
    const k = chave(agenteId, g.clube_id);
    const atual = out.get(k) ?? { agente_id: agenteId, clube_id: g.clube_id, rake_total: 0, player_result: 0 };
    atual.rake_total += g.rake_total;
    atual.player_result += g.player_result;
    out.set(k, atual);
  };

  for (const g of base) {
    somar(g.agente_id, g);
    const visitados = new Set([g.agente_id]);
    let atual = superagentePorAgente.get(g.agente_id) ?? null;
    let nivel = 0;
    // Guarda contra ciclo no cadastro (A é super de B e B é super de A).
    while (atual && !visitados.has(atual) && nivel < profundidadeMax) {
      somar(atual, g);
      visitados.add(atual);
      atual = superagentePorAgente.get(atual) ?? null;
      nivel++;
    }
  }
  return out;
}

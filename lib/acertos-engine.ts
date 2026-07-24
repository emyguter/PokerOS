import { supabase } from "@/lib/supabase";

export interface ClubSettings {
  id: string;
  name: string;
  external_id: string;
  settlement_type: string;
  taxa_tipo: string;
  fee_mtt_pct: number;
  fee_cash_pct: number | null;
  taxa_op_pct: number;
  rebate_pct: number;
  crypto_rebate_pct: number;
  rakeback_pct: number;
  spinup_pct: number;
}

export interface ImportRow {
  id: string;
  import_id: string;
  club_id: string | null;
  club_name: string;
  club_external_id: string;
  rake_total: number;
  rake_mtt: number;
  rake_cash: number;
  rake_spinup: number;
  player_result: number;
}

export interface AcertoCalculado {
  import_id: string;
  club_id: string | null;
  club_name: string;
  club_external_id: string;
  settlement_type: string;
  rake_mtt: number;
  rake_cash: number;
  rake_spinup: number;
  rake_total: number;
  player_result: number;
  fee_calculado: number;
  rebate_calculado: number;
  valor_acerto: number;
  status: string;
  // Quebra da fee por componente — só preenchido pra taxa_dinamica, usado no
  // card de acerto tradicional (Taxa MTT / Taxa Cash / SpinUp / Operacional
  // cada um na sua linha, em vez de só o total).
  fee_mtt_valor: number;
  fee_cash_valor: number;
  fee_operacional_valor: number;
  fee_spinup_valor: number;
  // % de cash efetivamente aplicado no período (fixo ou resolvido pela
  // condição SE/ENTÃO quando taxa_tipo é variável) — pra mostrar no card.
  taxa_cash_pct_aplicada: number | null;
}

// Condição SE/ENTÃO já resolvida em nomes de indicador (em vez de indicador_id),
// pronta pra ser avaliada contra uma linha importada.
interface CondicaoAvaliavel {
  operador: string;
  valor: number | null;
  resultado_pct: number | null;
  is_fallback: boolean;
  indicadorNomes: string[];
}

type RegraCondicaoRow = {
  operador: string;
  valor: number | null;
  resultado_pct: number | null;
  is_fallback: boolean;
  regra_condicao_termos?: { indicador_id: string }[];
};

type RegraEntidadeRow = {
  entidade_id: string;
  regras?: { regra_condicoes?: RegraCondicaoRow[] } | null;
};

// Mapeia o nome de um indicador pro valor real dele numa linha importada.
// `fee_total` e `num_mãos` ainda não têm dado de origem — voltam 0 até existir a coluna.
function valorIndicador(nome: string, row: ImportRow): number {
  switch (nome) {
    case "rake":
      return Math.abs(row.rake_total ?? 0);
    case "rake_cash":
      return Math.abs(row.rake_cash ?? 0);
    case "rake_mtt":
      return Math.abs(row.rake_mtt ?? 0);
    case "rake_spinup":
      return Math.abs(row.rake_spinup ?? 0);
    case "resultado_jogador":
      return row.player_result ?? 0;
    default:
      return 0;
  }
}

// Avalia as condições SE/ENTÃO de uma regra (em ordem) contra os dados da linha.
// Cada condição pode somar vários indicadores ("Ganhos + Rake"). A primeira que bater
// vence; se nenhuma bater, usa a condição SENÃO (fallback), se existir.
function avaliarCondicoes(condicoes: CondicaoAvaliavel[], row: ImportRow): number | null {
  for (const c of condicoes) {
    if (c.is_fallback || c.valor == null) continue;
    const soma = c.indicadorNomes.reduce((acc, nome) => acc + valorIndicador(nome, row), 0);
    const bate =
      c.operador === ">" ? soma > c.valor :
      c.operador === ">=" ? soma >= c.valor :
      c.operador === "<" ? soma < c.valor :
      c.operador === "<=" ? soma <= c.valor :
      soma === c.valor;
    if (bate) return c.resultado_pct;
  }
  return condicoes.find((c) => c.is_fallback)?.resultado_pct ?? null;
}

function calcularAcerto(
  row: ImportRow,
  club: ClubSettings,
  condicoesClube: CondicaoAvaliavel[]
): AcertoCalculado {
  let fee_calculado = 0;
  let rebate_calculado = 0;
  let valor_acerto = 0;
  let fee_mtt_valor = 0;
  let fee_cash_valor = 0;
  let fee_operacional_valor = 0;
  let fee_spinup_valor = 0;
  let taxa_cash_pct_aplicada: number | null = null;

  const rake_mtt    = Math.abs(row.rake_mtt ?? 0);
  const rake_cash   = Math.abs(row.rake_cash ?? 0);
  const rake_spinup = Math.abs(row.rake_spinup ?? 0);
  const rake_total  = Math.abs(row.rake_total ?? 0);

  switch (club.settlement_type) {
    case "taxa_dinamica": {
      // Taxa Operacional do App sempre é cobrada, some com a taxa de cash (fixa ou variável).
      fee_operacional_valor = rake_cash * (club.taxa_op_pct / 100);

      if (club.taxa_tipo === "variavel") {
        // Taxa variável: pega a faixa SE/ENTÃO que bate (ex: Ganhos+Rake) e aplica sobre o rake total.
        const pct = avaliarCondicoes(condicoesClube, row);
        taxa_cash_pct_aplicada = pct ?? 0;
        fee_cash_valor = rake_total * ((pct ?? 0) / 100);
      } else {
        // Taxa fixa: aplica o percentual fixo de cash sobre o rake de cash.
        taxa_cash_pct_aplicada = club.fee_cash_pct ?? 0;
        fee_cash_valor = rake_cash * ((club.fee_cash_pct ?? 0) / 100);
      }

      fee_mtt_valor = rake_mtt * (club.fee_mtt_pct / 100);
      fee_spinup_valor = rake_spinup * ((club.spinup_pct ?? 0) / 100);

      fee_calculado = fee_mtt_valor + fee_cash_valor + fee_operacional_valor + fee_spinup_valor;
      // Valor do Acerto = soma de todas as variáveis do período (confirmado
      // com a planilha manual do Cássio, fórmula =ARRED(SOMA(...);2)): Rake
      // Total + Ganhos/Perdas do jogador − a taxa cobrada (custo do clube).
      valor_acerto = rake_total + row.player_result - fee_calculado;
      break;
    }
    case "taxa_fixa_variavel":
      fee_calculado = rake_total * (club.fee_mtt_pct / 100);
      valor_acerto = rake_total + row.player_result - fee_calculado;
      break;
    case "rakeback":
      rebate_calculado = rake_total * (club.rakeback_pct / 100);
      valor_acerto = -rebate_calculado;
      break;
    case "weekly_usd":
      rebate_calculado =
        rake_total * (club.rebate_pct / 100) +
        rake_total * (club.crypto_rebate_pct / 100);
      fee_calculado = rake_total * (club.fee_mtt_pct / 100);
      valor_acerto  = fee_calculado - rebate_calculado;
      break;
    default:
      valor_acerto = 0;
  }

  return {
    import_id:        row.import_id,
    club_id:          row.club_id,
    club_name:        row.club_name,
    club_external_id: row.club_external_id,
    settlement_type:  club.settlement_type,
    rake_mtt, rake_cash, rake_spinup, rake_total,
    player_result:    row.player_result ?? 0,
    fee_calculado:    Math.round(fee_calculado    * 100) / 100,
    rebate_calculado: Math.round(rebate_calculado * 100) / 100,
    valor_acerto:     Math.round(valor_acerto     * 100) / 100,
    fee_mtt_valor:          Math.round(fee_mtt_valor          * 100) / 100,
    fee_cash_valor:         Math.round(fee_cash_valor         * 100) / 100,
    fee_operacional_valor:  Math.round(fee_operacional_valor  * 100) / 100,
    fee_spinup_valor:       Math.round(fee_spinup_valor       * 100) / 100,
    taxa_cash_pct_aplicada,
    status: "calculado",
  };
}

// Busca as regras SE/ENTÃO (com os termos de indicador já resolvidos em nome) de cada clube.
async function buscarCondicoesPorClube(clubIds: string[]): Promise<Map<string, CondicaoAvaliavel[]>> {
  const mapa = new Map<string, CondicaoAvaliavel[]>();
  if (clubIds.length === 0) return mapa;

  const { data: indicadores } = await supabase.from("indicadores").select("id, nome");
  const nomeIndicadorPorId = new Map<string, string>((indicadores ?? []).map((i) => [i.id, i.nome]));

  const { data: regraEntidades } = await supabase
    .from("regra_entidades")
    .select("entidade_id, regras(regra_condicoes(operador, valor, resultado_pct, is_fallback, regra_condicao_termos(indicador_id)))")
    .eq("entidade_tipo", "clube")
    .in("entidade_id", clubIds);

  for (const re of (regraEntidades ?? []) as RegraEntidadeRow[]) {
    const condicoesBrutas = re.regras?.regra_condicoes ?? [];
    const condicoes: CondicaoAvaliavel[] = condicoesBrutas.map((c) => ({
      operador: c.operador,
      valor: c.valor,
      resultado_pct: c.resultado_pct,
      is_fallback: c.is_fallback,
      indicadorNomes: (c.regra_condicao_termos ?? [])
        .map((t) => nomeIndicadorPorId.get(t.indicador_id))
        .filter((nome): nome is string => !!nome),
    }));
    mapa.set(re.entidade_id, condicoes);
  }

  return mapa;
}

export async function processarAcertos(importId: string): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    const { data: rows, error: rowsError } = await supabase
      .from("import_rows")
      .select("*")
      .eq("import_id", importId);

    if (rowsError) throw new Error(rowsError.message);
    if (!rows || rows.length === 0)
      return { success: false, count: 0, error: "Nenhuma linha encontrada." };

    const { data: clubs, error: clubsError } = await supabase
      .from("clubs")
      .select("id, name, external_id, settlement_type, taxa_tipo, fee_mtt_pct, fee_cash_pct, taxa_op_pct, rebate_pct, crypto_rebate_pct, rakeback_pct, spinup_pct");

    if (clubsError) throw new Error(clubsError.message);

    const clubByExtId = new Map<string, ClubSettings>(
      (clubs ?? []).filter((c) => c.external_id).map((c) => [String(c.external_id), c])
    );
    const clubByName = new Map<string, ClubSettings>(
      (clubs ?? []).map((c) => [c.name.toLowerCase().trim(), c])
    );

    const condicoesPorClube = await buscarCondicoesPorClube((clubs ?? []).map((c) => c.id));

    // Os campos manuais do card (Bilhetes, Pendências/Antecipação, Taxa A-A
    // Home Game) não vêm de cálculo nenhum — o usuário digita direto no card
    // do clube. Preserva esses valores ao recalcular, senão "Recalcular"
    // apagaria tudo que foi digitado à mão.
    const { data: extrasExistentes } = await supabase
      .from("acertos")
      .select("club_external_id, bilhetes, pendencias_antecipacao, taxa_aa_home_game")
      .eq("import_id", importId);
    const extrasPorClube = new Map<string, { bilhetes: number; pendencias_antecipacao: number; taxa_aa_home_game: number }>(
      (extrasExistentes ?? []).map((e) => [e.club_external_id, {
        bilhetes: e.bilhetes ?? 0,
        pendencias_antecipacao: e.pendencias_antecipacao ?? 0,
        taxa_aa_home_game: e.taxa_aa_home_game ?? 0,
      }])
    );

    await supabase.from("acertos").delete().eq("import_id", importId);

    const acertos: AcertoCalculado[] = [];

    for (const row of rows as ImportRow[]) {
      const club =
        clubByExtId.get(String(row.club_external_id)) ??
        clubByName.get(row.club_name.toLowerCase().trim());

      if (!club) {
        acertos.push({
          import_id: row.import_id, club_id: null,
          club_name: row.club_name, club_external_id: row.club_external_id,
          settlement_type: "sem_regra",
          rake_mtt: Math.abs(row.rake_mtt ?? 0),
          rake_cash: Math.abs(row.rake_cash ?? 0),
          rake_spinup: Math.abs(row.rake_spinup ?? 0),
          rake_total: Math.abs(row.rake_total ?? 0),
          player_result: row.player_result ?? 0,
          fee_calculado: 0, rebate_calculado: 0, valor_acerto: 0,
          fee_mtt_valor: 0, fee_cash_valor: 0, fee_operacional_valor: 0, fee_spinup_valor: 0,
          taxa_cash_pct_aplicada: null,
          status: "sem_regra",
        });
        continue;
      }
      acertos.push(calcularAcerto(row as ImportRow, club, condicoesPorClube.get(club.id) ?? []));
    }

    const acertosComExtras = acertos.map((a) => ({
      ...a,
      ...(extrasPorClube.get(a.club_external_id) ?? { bilhetes: 0, pendencias_antecipacao: 0, taxa_aa_home_game: 0 }),
    }));

    const { error: insertError } = await supabase.from("acertos").insert(acertosComExtras);
    if (insertError) throw new Error(insertError.message);

    const semRegra = acertos.filter((a) => a.status === "sem_regra").length;
    await supabase
      .from("imports")
      .update({ status: semRegra > 0 ? "parcial" : "acertos_calculados" })
      .eq("id", importId);

    return { success: true, count: acertos.length };
  } catch (err) {
    return { success: false, count: 0, error: err instanceof Error ? err.message : "Erro" };
  }
}

export interface AcertoAgenteCalculado {
  import_id: string;
  agente_id: string;
  clube_id: string | null;
  agente_nome: string;
  clube_nome: string | null;
  rake_total: number;
  rakeback_pct: number;
  valor_rakeback: number;
}

// Roda junto com processarAcertos: soma o rake por jogador (import_jogadores,
// já persistido desde a colheita bronze/silver) agrupado por Agente x Clube,
// aplica o rakeback_pct daquele par específico (cada clube pode negociar um %
// diferente com o mesmo agente) e grava em acertos_agentes.
export async function processarAcertosAgentes(importId: string): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    const { data: jogadores, error: jogadoresError } = await supabase
      .from("import_jogadores")
      .select("agente_id, clube_id, rake_total")
      .eq("import_id", importId)
      .not("agente_id", "is", null);
    if (jogadoresError) throw new Error(jogadoresError.message);

    await supabase.from("acertos_agentes").delete().eq("import_id", importId);

    if (!jogadores || jogadores.length === 0) return { success: true, count: 0 };

    const grupos = new Map<string, { agente_id: string; clube_id: string | null; rake_total: number }>();
    for (const j of jogadores as { agente_id: string; clube_id: string | null; rake_total: number }[]) {
      const chave = `${j.agente_id}:${j.clube_id ?? "sem_clube"}`;
      const atual = grupos.get(chave) ?? { agente_id: j.agente_id, clube_id: j.clube_id, rake_total: 0 };
      atual.rake_total += j.rake_total ?? 0;
      grupos.set(chave, atual);
    }

    const agenteIds = [...new Set([...grupos.values()].map((g) => g.agente_id))];
    const clubeIds = [...new Set([...grupos.values()].map((g) => g.clube_id).filter((id): id is string => !!id))];

    const [{ data: agentes }, { data: clubes }, { data: rakebacks }] = await Promise.all([
      supabase.from("agentes").select("id, nome").in("id", agenteIds),
      supabase.from("clubs").select("id, name").in("id", clubeIds),
      supabase.from("clube_agentes").select("agente_id, clube_id, rakeback_pct").in("agente_id", agenteIds),
    ]);

    const nomeAgentePorId = new Map((agentes ?? []).map((a) => [a.id as string, a.nome as string]));
    const nomeClubePorId = new Map((clubes ?? []).map((c) => [c.id as string, c.name as string]));
    const rakebackPorChave = new Map(
      (rakebacks ?? []).map((r) => [`${r.agente_id}:${r.clube_id}`, (r.rakeback_pct as number | null) ?? 0])
    );

    const acertosAgentes: AcertoAgenteCalculado[] = [...grupos.values()].map((g) => {
      const pct = g.clube_id ? rakebackPorChave.get(`${g.agente_id}:${g.clube_id}`) ?? 0 : 0;
      return {
        import_id: importId,
        agente_id: g.agente_id,
        clube_id: g.clube_id,
        agente_nome: nomeAgentePorId.get(g.agente_id) ?? "—",
        clube_nome: g.clube_id ? nomeClubePorId.get(g.clube_id) ?? "—" : null,
        rake_total: Math.round(g.rake_total * 100) / 100,
        rakeback_pct: pct,
        valor_rakeback: Math.round(g.rake_total * (pct / 100) * 100) / 100,
      };
    });

    const { error: insertError } = await supabase.from("acertos_agentes").insert(acertosAgentes);
    if (insertError) throw new Error(insertError.message);

    return { success: true, count: acertosAgentes.length };
  } catch (err) {
    return { success: false, count: 0, error: err instanceof Error ? err.message : "Erro" };
  }
}

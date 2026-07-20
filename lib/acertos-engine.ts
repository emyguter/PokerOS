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

  const rake_mtt    = Math.abs(row.rake_mtt ?? 0);
  const rake_cash   = Math.abs(row.rake_cash ?? 0);
  const rake_spinup = Math.abs(row.rake_spinup ?? 0);
  const rake_total  = Math.abs(row.rake_total ?? 0);

  switch (club.settlement_type) {
    case "taxa_dinamica": {
      // Taxa Operacional do App sempre é cobrada, some com a taxa de cash (fixa ou variável).
      const taxaOperacional = rake_cash * (club.taxa_op_pct / 100);

      let taxaCash: number;
      if (club.taxa_tipo === "variavel") {
        // Taxa variável: pega a faixa SE/ENTÃO que bate (ex: Ganhos+Rake) e aplica sobre o rake total.
        const pct = avaliarCondicoes(condicoesClube, row);
        taxaCash = rake_total * ((pct ?? 0) / 100);
      } else {
        // Taxa fixa: aplica o percentual fixo de cash sobre o rake de cash.
        taxaCash = rake_cash * ((club.fee_cash_pct ?? 0) / 100);
      }

      fee_calculado =
        rake_mtt * (club.fee_mtt_pct / 100) +
        taxaCash +
        taxaOperacional +
        rake_spinup * ((club.spinup_pct ?? 0) / 100);
      valor_acerto = fee_calculado;
      break;
    }
    case "taxa_fixa_variavel":
      fee_calculado = rake_total * (club.fee_mtt_pct / 100);
      valor_acerto = fee_calculado;
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
          status: "sem_regra",
        });
        continue;
      }
      acertos.push(calcularAcerto(row as ImportRow, club, condicoesPorClube.get(club.id) ?? []));
    }

    const { error: insertError } = await supabase.from("acertos").insert(acertos);
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

import { supabase } from "@/lib/supabase";
import { marcarDividasPagasComRake } from "@/lib/dividas";

export interface ClubSettings {
  id: string;
  name: string;
  external_id: string;
  settlement_type: string;
  taxa_tipo: string;
  fee_mtt_pct: number;
  fee_cash_pct: number | null;
  taxa_op_pct: number;
  taxa_op_ativo: boolean;
  rebate_pct: number;
  crypto_rebate_pct: number;
  rakeback_pct: number;
  spinup_pct: number;
  wtr4_semanas_manual: number | null;
  league_id: string | null;
}

// % fixo do cadastro da Liga (leagues.taxa_app_pct) + Regra de Faixa
// vinculada à Liga no campo taxa_liga, se tiver — ver calcularAcerto.
export interface TaxaLigaConfig {
  pctFixo: number | null;
  condicoes: CondicaoAvaliavel[];
}

export const TAXA_LIGA_VAZIA: TaxaLigaConfig = { pctFixo: null, condicoes: [] };

export interface ImportRow {
  id: string;
  import_id: string;
  club_name: string;
  club_external_id: string;
  rake_total: number;
  rake_mtt: number;
  rake_cash: number;
  rake_spinup: number;
  player_result: number;
  bilhetes: number;
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
  // Taxa da Liga — incide sobre Rake Total + SpinUp Rake, em cima de
  // qualquer tipo de cobrança do clube (ver calcularAcerto). Já descontada
  // de valor_acerto; guardada separada só pra mostrar a linha no card.
  taxa_liga_valor: number;
}

// Condição SE/ENTÃO já resolvida em nomes de indicador (em vez de indicador_id),
// pronta pra ser avaliada contra uma linha importada.
export interface CondicaoAvaliavel {
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

// Duplicado de lib/types.ts (evita import circular) — se mudar aqui, muda lá
// também, junto com CAMPOS_POR_SETTLEMENT (que precisa bater com o switch de
// club.settlement_type abaixo). taxa_liga é o único campo daqui vinculado a
// uma Liga, não a um Clube — ver buscarCondicoesTaxaLigaPorLiga.
export type CampoClube = "fee_mtt" | "fee_cash" | "taxa_op" | "spinup" | "rake_total" | "taxa_liga";

type RegraEntidadeRow = {
  entidade_id: string;
  campo: CampoClube | null;
  regras?: { regra_condicoes?: RegraCondicaoRow[] } | null;
};

export const CONDICOES_VAZIAS: Record<CampoClube, CondicaoAvaliavel[]> = {
  fee_mtt: [], fee_cash: [], taxa_op: [], spinup: [], rake_total: [], taxa_liga: [],
};

// Mapeia o nome de um indicador pro valor real dele numa linha importada.
// `fee_total` e `num_mãos` ainda não têm dado de origem — voltam 0 até existir a coluna.
// WtR (Win to Rake) é a razão bruta Ganhos/Rake — não multiplicado por 100 —
// pra bater com a escala que o Cássio usa nas condições das regras (ex: < -1.25).
// WtR 4 Semanas é a média dessa razão nos últimos 4 acertos do clube
// (incluindo o período atual), já vem calculado em `wtr4Semanas`.
export function valorIndicador(nome: string, row: ImportRow, wtr4Semanas: number | null): number {
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
    case "wtr":
      return row.rake_total ? (row.player_result ?? 0) / row.rake_total : 0;
    case "wtr_4_semanas":
      return wtr4Semanas ?? 0;
    default:
      return 0;
  }
}

// Avalia as condições SE/ENTÃO de uma regra (em ordem) contra os dados da linha.
// Cada condição pode somar vários indicadores ("Ganhos + Rake"). A primeira que bater
// vence; se nenhuma bater, usa a condição SENÃO (fallback), se existir.
export function avaliarCondicoes(condicoes: CondicaoAvaliavel[], row: ImportRow, wtr4Semanas: number | null): number | null {
  for (const c of condicoes) {
    if (c.is_fallback || c.valor == null) continue;
    const soma = c.indicadorNomes.reduce((acc, nome) => acc + valorIndicador(nome, row, wtr4Semanas), 0);
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

// Bônus de Indicação: confirmado com o Cássio — quem indica outro clube
// ganha um bônus sobre o PRÓPRIO rake (não o do clube indicado), igual à %
// digitada no vínculo (club_indicacoes.percentual), sem teto. Se o clube
// tiver mais de uma indicação, os percentuais somam antes de aplicar sobre o
// rake — `percentualTotal` já vem somado de quem chama. Sai sozinho toda vez
// que o Acerto é calculado.
export function calcularIndicacao(percentualTotal: number, rakeTotalProprio: number): number {
  return Math.round(rakeTotalProprio * (percentualTotal / 100) * 100) / 100;
}

export function calcularAcerto(
  row: ImportRow,
  club: ClubSettings,
  condicoesPorCampo: Record<CampoClube, CondicaoAvaliavel[]>,
  wtr4Semanas: number | null,
  taxaLiga: TaxaLigaConfig = TAXA_LIGA_VAZIA
): AcertoCalculado {
  let fee_calculado = 0;
  let rebate_calculado = 0;
  let valor_acerto = 0;
  let fee_mtt_valor = 0;
  let fee_cash_valor = 0;
  let fee_operacional_valor = 0;
  let fee_spinup_valor = 0;
  let taxa_liga_valor = 0;
  let taxa_cash_pct_aplicada: number | null = null;
  let tipoReconhecido = true;

  const rake_mtt    = Math.abs(row.rake_mtt ?? 0);
  const rake_cash   = Math.abs(row.rake_cash ?? 0);
  const rake_spinup = Math.abs(row.rake_spinup ?? 0);
  const rake_total  = Math.abs(row.rake_total ?? 0);

  switch (club.settlement_type) {
    case "taxa_dinamica": {
      // Base de cada taxa confirmada célula a célula contra a planilha manual
      // "LPLPG_ACERTOS" do Cássio (abas por clube, ex: Agreste_Poker,
      // Authentic Gold, @fsapoker, Kings Online BR): Fee Cash (fixo ou
      // variável, "Taxa Dinâmica - Cash%") multiplica sobre o próprio Rake
      // Cash; Taxa Operacional multiplica sobre o Rake TOTAL, não sobre o
      // Rake Cash. Fee MTT e SpinUp sempre usam a própria base.
      if (condicoesPorCampo.fee_cash.length > 0) {
        const pct = avaliarCondicoes(condicoesPorCampo.fee_cash, row, wtr4Semanas);
        taxa_cash_pct_aplicada = pct ?? 0;
        fee_cash_valor = rake_cash * ((pct ?? 0) / 100);
      } else {
        taxa_cash_pct_aplicada = club.fee_cash_pct ?? 0;
        fee_cash_valor = rake_cash * ((club.fee_cash_pct ?? 0) / 100);
      }

      if (condicoesPorCampo.fee_mtt.length > 0) {
        const pct = avaliarCondicoes(condicoesPorCampo.fee_mtt, row, wtr4Semanas);
        fee_mtt_valor = rake_mtt * ((pct ?? 0) / 100);
      } else {
        fee_mtt_valor = rake_mtt * (club.fee_mtt_pct / 100);
      }

      if (condicoesPorCampo.taxa_op.length > 0) {
        const pct = avaliarCondicoes(condicoesPorCampo.taxa_op, row, wtr4Semanas);
        fee_operacional_valor = rake_total * ((pct ?? 0) / 100);
      } else if (club.taxa_op_ativo) {
        fee_operacional_valor = rake_total * (club.taxa_op_pct / 100);
      }

      if (condicoesPorCampo.spinup.length > 0) {
        const pct = avaliarCondicoes(condicoesPorCampo.spinup, row, wtr4Semanas);
        fee_spinup_valor = rake_spinup * ((pct ?? 0) / 100);
      } else {
        fee_spinup_valor = rake_spinup * ((club.spinup_pct ?? 0) / 100);
      }

      fee_calculado = fee_mtt_valor + fee_cash_valor + fee_operacional_valor + fee_spinup_valor;
      // Valor do Acerto = soma de todas as variáveis do período (confirmado
      // com a planilha manual do Cássio, fórmula =ARRED(SOMA(...);2)): Rake
      // Total + Ganhos/Perdas do jogador − a taxa cobrada (custo do clube).
      valor_acerto = rake_total + row.player_result - fee_calculado;
      break;
    }
    case "taxa_fixa_variavel": {
      // Taxa única do clube, sem separar MTT/Cash — se tiver Regra vinculada
      // no campo "Rake Total", a % SE/ENTÃO substitui o fee_mtt_pct fixo do
      // cadastro (mesmo campo usado só por convenção histórica de coluna).
      const condRakeTotal = condicoesPorCampo.rake_total.length > 0
        ? avaliarCondicoes(condicoesPorCampo.rake_total, row, wtr4Semanas)
        : null;
      fee_calculado = rake_total * ((condRakeTotal ?? club.fee_mtt_pct) / 100);
      valor_acerto = rake_total + row.player_result - fee_calculado;
      break;
    }
    case "rakeback":
      rebate_calculado = rake_total * (club.rakeback_pct / 100);
      valor_acerto = -rebate_calculado;
      break;
    case "weekly_usd": {
      const condRakeTotal = condicoesPorCampo.rake_total.length > 0
        ? avaliarCondicoes(condicoesPorCampo.rake_total, row, wtr4Semanas)
        : null;
      rebate_calculado =
        rake_total * (club.rebate_pct / 100) +
        rake_total * (club.crypto_rebate_pct / 100);
      fee_calculado = rake_total * ((condRakeTotal ?? club.fee_mtt_pct) / 100);
      valor_acerto  = fee_calculado - rebate_calculado;
      break;
    }
    default:
      valor_acerto = 0;
      tipoReconhecido = false;
  }

  // Taxa da Liga: incide sobre TODO o rake do período (Rake Total + SpinUp
  // Rake, os 3 tipos de jogo somados) — layer por cima do resto, em cima de
  // qualquer tipo de cobrança do clube (confirmado com o Cássio). % fixo do
  // cadastro da Liga manda sempre que estiver preenchido; a Regra vinculada
  // à Liga (campo taxa_liga) só entra como fallback quando o cadastro está
  // vazio (confirmado com o Cássio — mudou de "Regra manda" pra "cadastro
  // manda, Regra é o reserva"). Não se aplica quando o clube nem tem tipo de
  // cobrança reconhecido (fallback "sem_regra" — nada mais é cobrado ali
  // também).
  if (tipoReconhecido) {
    const baseTaxaLiga = rake_total + rake_spinup;
    const pctTaxaLiga = taxaLiga.pctFixo != null
      ? taxaLiga.pctFixo
      : taxaLiga.condicoes.length > 0
      ? avaliarCondicoes(taxaLiga.condicoes, row, wtr4Semanas)
      : null;
    taxa_liga_valor = baseTaxaLiga * ((pctTaxaLiga ?? 0) / 100);
    valor_acerto -= taxa_liga_valor;
  }

  return {
    import_id:        row.import_id,
    // Não usar row.club_id: import_rows nunca grava esse campo (só
    // club_name/club_external_id) — o clube de verdade, já casado por
    // external_id ou nome, é o "club" recebido aqui.
    club_id:          club.id,
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
    taxa_liga_valor:        Math.round(taxa_liga_valor        * 100) / 100,
    taxa_cash_pct_aplicada,
    status: "calculado",
  };
}

// Busca as regras SE/ENTÃO (com os termos de indicador já resolvidos em nome) de cada
// clube, separadas por campo (Fee MTT/Cash/Operacional/SpinUp) — cada uma pode ou não
// ter um vínculo próprio; sem vínculo pro campo, o cálculo cai pro % fixo do cadastro.
async function buscarCondicoesPorClube(clubIds: string[]): Promise<Map<string, Record<CampoClube, CondicaoAvaliavel[]>>> {
  const mapa = new Map<string, Record<CampoClube, CondicaoAvaliavel[]>>();
  if (clubIds.length === 0) return mapa;

  const { data: indicadores } = await supabase.from("indicadores").select("id, nome");
  const nomeIndicadorPorId = new Map<string, string>((indicadores ?? []).map((i) => [i.id, i.nome]));

  const { data: regraEntidades } = await supabase
    .from("regra_entidades")
    .select("entidade_id, campo, regras(regra_condicoes(operador, valor, resultado_pct, is_fallback, regra_condicao_termos(indicador_id)))")
    .eq("entidade_tipo", "clube")
    .in("entidade_id", clubIds);

  for (const re of (regraEntidades ?? []) as RegraEntidadeRow[]) {
    if (!re.campo) continue; // vínculo antigo sem campo definido — ignora, cai pro % fixo
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
    const atual = mapa.get(re.entidade_id) ?? { ...CONDICOES_VAZIAS };
    atual[re.campo] = condicoes;
    mapa.set(re.entidade_id, atual);
  }

  return mapa;
}

// Mesma ideia de buscarCondicoesPorClube, mas pra Taxa da Liga — vinculada à
// Liga (entidade_tipo='liga'), não ao Clube, e sempre no campo taxa_liga.
async function buscarCondicoesTaxaLigaPorLiga(leagueIds: string[]): Promise<Map<string, CondicaoAvaliavel[]>> {
  const mapa = new Map<string, CondicaoAvaliavel[]>();
  if (leagueIds.length === 0) return mapa;

  const { data: indicadores } = await supabase.from("indicadores").select("id, nome");
  const nomeIndicadorPorId = new Map<string, string>((indicadores ?? []).map((i) => [i.id, i.nome]));

  const { data: regraEntidades } = await supabase
    .from("regra_entidades")
    .select("entidade_id, campo, regras(regra_condicoes(operador, valor, resultado_pct, is_fallback, regra_condicao_termos(indicador_id)))")
    .eq("entidade_tipo", "liga")
    .eq("campo", "taxa_liga")
    .in("entidade_id", leagueIds);

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

// Últimos até-3 acertos anteriores de cada clube (excluindo o import atual),
// pra compor o WtR 4 Semanas junto com a linha sendo calculada agora — mesma
// lógica já usada no card de Acerto (ClubAcertoCard: média de Ganhos/Rake dos
// últimos 4 acertos, incluindo o período atual).
async function buscarHistoricoWtr(clubExternalIds: string[], importIdAtual: string): Promise<Map<string, { player_result: number; rake_total: number }[]>> {
  const mapa = new Map<string, { player_result: number; rake_total: number }[]>();
  if (clubExternalIds.length === 0) return mapa;

  const { data } = await supabase
    .from("acertos")
    .select("club_external_id, player_result, rake_total, imports(period_start)")
    .in("club_external_id", clubExternalIds)
    .neq("import_id", importIdAtual)
    .order("imports(period_start)", { ascending: false });

  for (const row of (data ?? []) as unknown as { club_external_id: string; player_result: number; rake_total: number }[]) {
    const lista = mapa.get(row.club_external_id) ?? [];
    if (lista.length < 3) { lista.push(row); mapa.set(row.club_external_id, lista); }
  }
  return mapa;
}

function calcularWtr4Semanas(row: ImportRow, historico: { player_result: number; rake_total: number }[]): number | null {
  const candidatos = [{ player_result: row.player_result ?? 0, rake_total: row.rake_total ?? 0 }, ...historico].filter((r) => r.rake_total);
  if (candidatos.length === 0) return null;
  return candidatos.reduce((s, r) => s + r.player_result / r.rake_total, 0) / candidatos.length;
}

// Pendências/Antecipação = lançamentos de Antecipação do Suporte já
// conciliados (conciliado_com preenchido = já casou com o par da Genia),
// dentro do período do acerto — confirmado com o Cássio. Soma só o lado
// Suporte (o real) e não o par da Genia, senão dobra o valor (mesma regra de
// origem já usada em Acertos/Extrato/ClubAcertoCard).
async function buscarPendenciasAntecipacao(clubIds: string[], periodStart: string, periodEnd: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (clubIds.length === 0 || !periodStart) return mapa;

  const { data } = await supabase
    .from("lancamentos")
    .select("clube_id, natureza, valor")
    .in("clube_id", clubIds)
    .eq("tipo", "antecipacao")
    .eq("origem", "suporte")
    .not("conciliado_com", "is", null)
    .gte("data_lancamento", periodStart)
    .lte("data_lancamento", periodEnd || periodStart);

  for (const row of (data ?? []) as { clube_id: string; natureza: "credito" | "debito"; valor: number }[]) {
    const delta = row.natureza === "credito" ? row.valor : -row.valor;
    mapa.set(row.clube_id, (mapa.get(row.clube_id) ?? 0) + delta);
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
      .select("id, name, external_id, settlement_type, taxa_tipo, fee_mtt_pct, fee_cash_pct, taxa_op_pct, taxa_op_ativo, rebate_pct, crypto_rebate_pct, rakeback_pct, spinup_pct, wtr4_semanas_manual, league_id");

    if (clubsError) throw new Error(clubsError.message);

    // Liga/plataforma do import, pra pré-cadastro automático herdar — o
    // clube que aparece na planilha mas ainda não foi cadastrado. Período
    // também sai daqui, pra achar as Antecipações conciliadas desse mesmo
    // intervalo (ver buscarPendenciasAntecipacao).
    const { data: importInfo } = await supabase
      .from("imports")
      .select("league_id, plataforma_id, period_start, period_end")
      .eq("id", importId)
      .single();

    const clubByExtId = new Map<string, ClubSettings>(
      (clubs ?? []).filter((c) => c.external_id).map((c) => [String(c.external_id), c])
    );
    const clubByName = new Map<string, ClubSettings>(
      (clubs ?? []).map((c) => [c.name.toLowerCase().trim(), c])
    );

    const condicoesPorClube = await buscarCondicoesPorClube((clubs ?? []).map((c) => c.id));
    const historicoWtrPorClube = await buscarHistoricoWtr(
      [...new Set((rows as ImportRow[]).map((r) => r.club_external_id))],
      importId
    );

    // Taxa da Liga (ver TaxaLigaConfig) — inclui a liga do import mesmo que
    // nenhum clube já cadastrado pertença a ela ainda, pra cobrir o caso de
    // pré-cadastro automático (clube novo criado abaixo com esse league_id).
    const leagueIds = new Set((clubs ?? []).map((c) => c.league_id).filter((id): id is string => !!id));
    if (importInfo?.league_id) leagueIds.add(importInfo.league_id);
    const { data: leaguesData } = await supabase.from("leagues").select("id, taxa_app_pct").in("id", [...leagueIds]);
    const taxaAppPctPorLiga = new Map<string, number | null>((leaguesData ?? []).map((l) => [l.id as string, l.taxa_app_pct as number | null]));
    const condicoesTaxaLigaPorLiga = await buscarCondicoesTaxaLigaPorLiga([...leagueIds]);
    const taxaLigaDoClube = (c: ClubSettings): TaxaLigaConfig =>
      c.league_id
        ? { pctFixo: taxaAppPctPorLiga.get(c.league_id) ?? null, condicoes: condicoesTaxaLigaPorLiga.get(c.league_id) ?? [] }
        : TAXA_LIGA_VAZIA;

    await supabase.from("acertos").delete().eq("import_id", importId);

    const acertos: AcertoCalculado[] = [];

    for (const row of rows as ImportRow[]) {
      let club =
        clubByExtId.get(String(row.club_external_id)) ??
        clubByName.get(row.club_name.toLowerCase().trim());

      if (!club) {
        // Pré-cadastro automático: o clube apareceu na planilha mas ainda
        // não foi cadastrado — cria só com o básico (nome, ID externo,
        // liga/plataforma do import). Taxas, regras, caução e stoploss
        // ficam em branco de propósito, pra alguém completar depois (a
        // etapa Regras do Cadastro avisa quando falta configurar).
        //
        // Só cria quando a linha tem ID externo — sem isso não dá pra saber
        // se é um clube novo de verdade ou uma linha malformada da planilha
        // (célula em branco, linha de rodapé/resumo etc). Já criou clube
        // fantasma de verdade uma vez (linha sem ID e com nome estranho tipo
        // "SUL HG - LP 20260713-20260719", duplicando um clube que já
        // existia) — melhor cair pra "sem_regra" e alguém revisar na mão do
        // que gerar cadastro errado sozinho.
        const novoClube = row.club_external_id
          ? (
              await supabase
                .from("clubs")
                .insert({
                  name: row.club_name,
                  external_id: row.club_external_id,
                  league_id: importInfo?.league_id ?? null,
                  plataforma_id: importInfo?.plataforma_id ?? null,
                  fee_mtt_pct: null, fee_cash_pct: null, taxa_op_pct: null, taxa_op_ativo: false, spinup_pct: null,
                  caucao_atual: null, stoploss_inicial: null,
                })
                .select("id, name, external_id, settlement_type, taxa_tipo, fee_mtt_pct, fee_cash_pct, taxa_op_pct, taxa_op_ativo, rebate_pct, crypto_rebate_pct, rakeback_pct, spinup_pct, wtr4_semanas_manual, league_id")
                .single()
            ).data
          : null;

        if (!novoClube) {
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
            fee_mtt_valor: 0, fee_cash_valor: 0, fee_operacional_valor: 0, fee_spinup_valor: 0, taxa_liga_valor: 0,
            taxa_cash_pct_aplicada: null,
            status: "sem_regra",
          });
          continue;
        }

        club = novoClube as ClubSettings;
        clubByExtId.set(String(club.external_id), club);
        clubByName.set(club.name.toLowerCase().trim(), club);
      }
      // O WtR 4 Semanas manual (cadastro > Regras) só é usado como tapa-buraco
      // enquanto o clube não tem 4 semanas seguidas de histórico no banco
      // (linha atual + 3 acertos anteriores). Assim que o histórico for
      // suficiente — ex: Cássio subindo os imports que faltam — o sistema
      // volta sozinho a usar o cálculo automático, sem precisar apagar o
      // valor manual na mão.
      const historicoWtr = historicoWtrPorClube.get(row.club_external_id) ?? [];
      const wtr4Semanas =
        historicoWtr.length < 3 && club.wtr4_semanas_manual != null
          ? club.wtr4_semanas_manual
          : calcularWtr4Semanas(row as ImportRow, historicoWtr);
      acertos.push(calcularAcerto(row as ImportRow, club, condicoesPorClube.get(club.id) ?? CONDICOES_VAZIAS, wtr4Semanas, taxaLigaDoClube(club)));
    }

    const bilhetesPorClube = new Map<string, number>(
      (rows as ImportRow[]).map((r) => [r.club_external_id, r.bilhetes ?? 0])
    );
    const clubIdsResolvidos = [...new Set(acertos.map((a) => a.club_id).filter((id): id is string => !!id))];
    const pendenciasPorClube = await buscarPendenciasAntecipacao(
      clubIdsResolvidos,
      importInfo?.period_start ?? "",
      importInfo?.period_end ?? ""
    );

    // Bônus de Indicação (ver calcularIndicacao acima): club_indicacoes.club_id
    // é quem ganha o bônus, sobre o próprio rake, não o do clube indicado —
    // soma o percentual de todas as indicações desse clube antes de aplicar.
    const { data: indicacoesData } = await supabase
      .from("club_indicacoes")
      .select("club_id, taxa_indicacao_pct")
      .in("club_id", clubIdsResolvidos);
    const percentualIndicacaoPorClube = new Map<string, number>();
    for (const i of (indicacoesData ?? []) as { club_id: string; taxa_indicacao_pct: number }[]) {
      percentualIndicacaoPorClube.set(i.club_id, (percentualIndicacaoPorClube.get(i.club_id) ?? 0) + (i.taxa_indicacao_pct ?? 0));
    }

    const acertosComExtras = acertos.map((a) => ({
      ...a,
      bilhetes: bilhetesPorClube.get(a.club_external_id) ?? 0,
      pendencias_antecipacao: a.club_id ? pendenciasPorClube.get(a.club_id) ?? 0 : 0,
      indicacao_valor: a.club_id
        ? calcularIndicacao(percentualIndicacaoPorClube.get(a.club_id) ?? 0, a.rake_total)
        : 0,
    }));

    const { error: insertError } = await supabase.from("acertos").insert(acertosComExtras);
    if (insertError) throw new Error(insertError.message);

    // Dívida/parcela marcada "Pagar com Rake" acabou de ter seu valor
    // descontado deste período (calcularTotalAcerto, chamado por quem exibe
    // o Acerto) — marca como paga agora, senão desconta de novo no próximo
    // import. Best-effort: os Acertos já foram salvos com sucesso acima,
    // isso não pode derrubar o processamento do import.
    try {
      await marcarDividasPagasComRake(clubIdsResolvidos, importInfo?.period_end || importInfo?.period_start || "");
    } catch { /* best-effort */ }

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

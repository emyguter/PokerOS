import { supabase } from "@/lib/supabase";
import { marcarDividasPagasComRake, getFaixasMultaDoClube, percentualMulta, diasDeAtraso as diasDeAtrasoDivida } from "@/lib/dividas";

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
  // Cotação (Moeda → Moeda de Conversão) do cadastro NO MOMENTO do cálculo —
  // ver AcertoCalculado.cotacao pra por que isso precisa ser gravado.
  cotacao: number | null;
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
  // Ganhos só do cash game (coluna "Ring Games" do PPPoker) — usado pro WtR,
  // que é uma métrica de cash game (confirmado pelo Cássio). Fica 0 em
  // plataformas/imports sem essa quebra (GGPoker, mapeamento genérico), o
  // que naturalmente tira essas linhas da média de WtR (mesmo filtro que já
  // existia pra rake zero).
  player_result_cash: number;
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
  // Ganhos só do cash game — guardado no Acerto pra alimentar o histórico de
  // WtR das próximas semanas (ver buscarHistoricoWtr/calcularWtr4Semanas).
  player_result_cash: number;
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
  // Cotação do cadastro do clube usada NO MOMENTO desse cálculo — gravada
  // aqui (em vez de só ler clubs.cotacao ao vivo) pra não perder o valor
  // usado quando o campo do cadastro mudar depois (perguntado pelo Cássio:
  // "quando calculou foi com qual valor?", sem resposta possível antes
  // disso). Null quando o clube não tem Moeda de Conversão/Cotação
  // cadastrada — ver "Total Convertido" em ClubAcertoCard.
  cotacao: number | null;
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
  ordem: number;
  regra_condicao_termos?: { indicador_id: string }[];
};

// Duplicado de lib/types.ts (evita import circular) — se mudar aqui, muda lá
// também, junto com CAMPOS_POR_SETTLEMENT (que precisa bater com o switch de
// club.settlement_type abaixo). taxa_liga é o único campo daqui que também
// pode vir vinculado à Liga (fonte principal — buscarCondicoesTaxaLigaPorLiga),
// além de poder vir vinculado ao Clube (fallback — buscarCondicoesPorClube).
export type CampoClube = "fee_mtt" | "fee_cash" | "taxa_op" | "spinup" | "rake_total" | "taxa_liga";

// Ordem de prioridade pra achar QUALQUER Regra do clube — usada só como
// referência de exibição da linha "Taxa da Liga" (ver calcularAcerto),
// quando não tem NADA configurado pra ela especificamente (nem % fixo na
// Liga, nem Regra vinculada à Liga, nem Regra vinculada ao Clube no campo
// Taxa da Liga). Pedido do Cássio (caso LS HS club): mostra a %/valor de
// referência na linha mesmo assim — usando a Regra que o clube já tem em
// outro campo (ex: Rake) — só que sem descontar de novo do Total, porque
// esse valor já está embutido no Fee calculado por essa mesma Regra (não é
// uma cobrança adicional de verdade, só transparência de qual % está
// rolando). Rake primeiro por já ser o fallback padrão de Fee Cash/Fee MTT
// no resto do motor (a Regra mais "geral" de um clube costuma estar lá).
const CAMPOS_REFERENCIA_TAXA_LIGA: CampoClube[] = ["rake_total", "fee_cash", "fee_mtt", "taxa_op", "spinup"];

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
      // WtR é uma métrica de cash game (confirmado pelo Cássio) — usa
      // Ganhos de Cash / Rake Cash, não os totais (que misturam MTT/SpinUp).
      return row.rake_cash ? (row.player_result_cash ?? 0) / row.rake_cash : 0;
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

// Bônus de Indicação: quem indica outro clube ganha um bônus sobre o rake do
// CLUBE INDICADO (não o próprio), igual à % digitada no vínculo
// (club_indicacoes.taxa_indicacao_pct), sem teto. Se o clube tiver mais de
// uma indicação, cada uma aplica sobre o rake do respectivo indicado e os
// valores em R$ somam (não dá pra somar os percentuais antes, já que cada
// indicação pode ter uma base de rake diferente). Sai sozinho toda vez que o
// Acerto é calculado.
export function calcularIndicacao(percentual: number, rakeTotalIndicado: number): number {
  return Math.round(rakeTotalIndicado * (percentual / 100) * 100) / 100;
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
      //
      // Regra vinculada no campo "Rake" (rake_total) é um fallback pra
      // quando Fee Cash/Fee MTT não têm regra própria — clube com uma única
      // Regra pro rake todo (em vez de duplicar a mesma regra em Fee MTT E
      // Fee Cash) passa a valer pros dois, aplicada sobre a base de cada um
      // (confirmado pelo Cássio, achado no caso Mts Poker). Continua
      // perdendo pra regra específica de cada campo quando ela existir.
      const condRakeTotal = condicoesPorCampo.rake_total.length > 0
        ? avaliarCondicoes(condicoesPorCampo.rake_total, row, wtr4Semanas)
        : null;

      if (condicoesPorCampo.fee_cash.length > 0) {
        const pct = avaliarCondicoes(condicoesPorCampo.fee_cash, row, wtr4Semanas);
        taxa_cash_pct_aplicada = pct ?? 0;
        fee_cash_valor = rake_cash * ((pct ?? 0) / 100);
      } else if (condRakeTotal != null) {
        taxa_cash_pct_aplicada = condRakeTotal;
        fee_cash_valor = rake_cash * (condRakeTotal / 100);
      } else {
        taxa_cash_pct_aplicada = club.fee_cash_pct ?? 0;
        fee_cash_valor = rake_cash * ((club.fee_cash_pct ?? 0) / 100);
      }

      if (condicoesPorCampo.fee_mtt.length > 0) {
        const pct = avaliarCondicoes(condicoesPorCampo.fee_mtt, row, wtr4Semanas);
        fee_mtt_valor = rake_mtt * ((pct ?? 0) / 100);
      } else if (condRakeTotal != null) {
        fee_mtt_valor = rake_mtt * (condRakeTotal / 100);
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

      // SpinUp NÃO é uma fee que a liga cobra do clube, ao contrário de Fee
      // MTT/Fee Cash/Taxa Operacional — é um crédito que o clube ganha
      // (confirmado pelo Cássio), por isso fica de fora do fee_calculado e
      // entra somando no Valor do Acerto, não subtraindo.
      fee_calculado = fee_mtt_valor + fee_cash_valor + fee_operacional_valor;
      // Valor do Acerto = soma de todas as variáveis do período (confirmado
      // com a planilha manual do Cássio, fórmula =ARRED(SOMA(...);2)): Rake
      // Total + Ganhos/Perdas do jogador + SpinUp (crédito) − a taxa cobrada
      // (custo do clube).
      valor_acerto = rake_total + row.player_result + fee_spinup_valor - fee_calculado;
      break;
    }
    case "taxa_fixa_variavel": {
      // Taxa única do clube, sem separar MTT/Cash — se tiver Regra vinculada
      // no campo "Rake Total", a % SE/ENTÃO substitui o fee_mtt_pct fixo do
      // cadastro (mesmo campo usado só por convenção histórica de coluna).
      // Taxa Operacional (quando ligada no cadastro) é uma fee ADICIONAL
      // sobre o Rake Total, somada em cima dessa taxa fixa/variável — mesma
      // base usada em Taxa Dinâmica (confirmado pelo Cássio: cadastro deixa
      // ligar Taxa Operacional pra qualquer tipo de clube, mas só Taxa
      // Dinâmica aplicava de verdade).
      const condRakeTotal = condicoesPorCampo.rake_total.length > 0
        ? avaliarCondicoes(condicoesPorCampo.rake_total, row, wtr4Semanas)
        : null;
      const taxaFixaVariavel = rake_total * ((condRakeTotal ?? club.fee_mtt_pct) / 100);

      if (condicoesPorCampo.taxa_op.length > 0) {
        const pct = avaliarCondicoes(condicoesPorCampo.taxa_op, row, wtr4Semanas);
        fee_operacional_valor = rake_total * ((pct ?? 0) / 100);
      } else if (club.taxa_op_ativo) {
        fee_operacional_valor = rake_total * (club.taxa_op_pct / 100);
      }

      fee_calculado = taxaFixaVariavel + fee_operacional_valor;
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
      rebate_calculado = rake_total * (club.rebate_pct / 100);
      fee_calculado = rake_total * ((condRakeTotal ?? club.fee_mtt_pct) / 100);
      valor_acerto = fee_calculado - rebate_calculado;
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
  // manda, Regra é o reserva"). Liga sem NADA configurado (nem % fixo, nem
  // Regra vinculada à Liga) cai pra Regra vinculada ao CLUBE no campo Taxa
  // da Liga, se tiver uma — confirmado de novo com o Cássio no caso MTS
  // POKER (Liga ORION sem nada preenchido em "Taxa da Liga"): antes disso
  // simplesmente virava 0%, o motor nunca olhava pro que tava atrelado ao
  // clube nesse campo específico (só fee_mtt/fee_cash/taxa_op/spinup/
  // rake_total olhavam pro clube — taxa_liga sempre foi só-Liga). Não se
  // aplica quando o clube nem tem tipo de cobrança reconhecido (fallback
  // "sem_regra" — nada mais é cobrado ali também).
  //
  // Sem NENHUMA dessas três fontes (nem Liga, nem Clube no campo certo), a
  // linha ainda mostra a %/valor de referência de QUALQUER outra Regra que o
  // clube já tenha (CAMPOS_REFERENCIA_TAXA_LIGA acima) — pedido do Cássio,
  // achado no caso LS HS club — só que sem descontar de novo do Total: essa
  // Regra já está embutida no Fee calculado ali em cima, então usá-la de
  // novo aqui seria cobrar em dobro (confirmado: "só mostrar a %/valor na
  // linha, sem mudar o Total").
  if (tipoReconhecido) {
    const baseTaxaLiga = rake_total + rake_spinup;
    const pctTaxaLigaDaLiga = taxaLiga.pctFixo != null
      ? taxaLiga.pctFixo
      : taxaLiga.condicoes.length > 0
      ? avaliarCondicoes(taxaLiga.condicoes, row, wtr4Semanas)
      : null;
    const pctTaxaLigaReal = pctTaxaLigaDaLiga ?? (condicoesPorCampo.taxa_liga.length > 0
      ? avaliarCondicoes(condicoesPorCampo.taxa_liga, row, wtr4Semanas)
      : null);

    let pctTaxaLigaReferencia: number | null = null;
    if (pctTaxaLigaReal == null) {
      for (const campo of CAMPOS_REFERENCIA_TAXA_LIGA) {
        if (condicoesPorCampo[campo].length === 0) continue;
        const pct = avaliarCondicoes(condicoesPorCampo[campo], row, wtr4Semanas);
        if (pct != null) { pctTaxaLigaReferencia = pct; break; }
      }
    }

    const pctTaxaLiga = pctTaxaLigaReal ?? pctTaxaLigaReferencia;
    taxa_liga_valor = baseTaxaLiga * ((pctTaxaLiga ?? 0) / 100);
    // Só desconta do Valor do Acerto quando veio de uma fonte "de verdade"
    // da Taxa da Liga (Liga ou Clube no campo certo) — o valor de
    // referência (achado em outro campo) fica só na linha, pra não descontar
    // o Fee duas vezes.
    if (pctTaxaLigaReal != null) valor_acerto -= taxa_liga_valor;
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
    player_result_cash: row.player_result_cash ?? 0,
    fee_calculado:    Math.round(fee_calculado    * 100) / 100,
    rebate_calculado: Math.round(rebate_calculado * 100) / 100,
    valor_acerto:     Math.round(valor_acerto     * 100) / 100,
    fee_mtt_valor:          Math.round(fee_mtt_valor          * 100) / 100,
    fee_cash_valor:         Math.round(fee_cash_valor         * 100) / 100,
    fee_operacional_valor:  Math.round(fee_operacional_valor  * 100) / 100,
    fee_spinup_valor:       Math.round(fee_spinup_valor       * 100) / 100,
    taxa_liga_valor:        Math.round(taxa_liga_valor        * 100) / 100,
    taxa_cash_pct_aplicada,
    cotacao: club.cotacao ?? null,
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
    .select("entidade_id, campo, regras(regra_condicoes(operador, valor, resultado_pct, is_fallback, ordem, regra_condicao_termos(indicador_id)))")
    .eq("entidade_tipo", "clube")
    .in("entidade_id", clubIds);

  for (const re of (regraEntidades ?? []) as RegraEntidadeRow[]) {
    if (!re.campo) continue; // vínculo antigo sem campo definido — ignora, cai pro % fixo
    // PostgREST não garante ordem em relações aninhadas sem ORDER BY — como
    // regra_condicoes.id é um uuid aleatório, sem ordenar por `ordem` aqui as
    // condições chegavam em sequência arbitrária, e "a primeira que bater
    // vence" (avaliarCondicoes) acabava usando uma faixa errada (achado com o
    // clube Agreste_poker: WtR -2,77 deveria bater "< -1,5 → 0%", mas batia
    // "< -1 → 4%" primeiro por causa da ordem errada).
    const condicoesBrutas = [...(re.regras?.regra_condicoes ?? [])].sort((a, b) => a.ordem - b.ordem);
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
    .select("entidade_id, campo, regras(regra_condicoes(operador, valor, resultado_pct, is_fallback, ordem, regra_condicao_termos(indicador_id)))")
    .eq("entidade_tipo", "liga")
    .eq("campo", "taxa_liga")
    .in("entidade_id", leagueIds);

  for (const re of (regraEntidades ?? []) as RegraEntidadeRow[]) {
    // Mesmo motivo do buscarCondicoesPorClube acima: sem ordenar por `ordem`,
    // a ordem de avaliação vinha arbitrária (id é uuid aleatório).
    const condicoesBrutas = [...(re.regras?.regra_condicoes ?? [])].sort((a, b) => a.ordem - b.ordem);
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
async function buscarHistoricoWtr(clubExternalIds: string[], importIdAtual: string): Promise<Map<string, { player_result_cash: number; rake_cash: number }[]>> {
  const mapa = new Map<string, { player_result_cash: number; rake_cash: number }[]>();
  if (clubExternalIds.length === 0) return mapa;

  const { data } = await supabase
    .from("acertos")
    .select("club_external_id, player_result_cash, rake_cash, created_at, imports(period_start)")
    .in("club_external_id", clubExternalIds)
    .neq("import_id", importIdAtual)
    .order("imports(period_start)", { ascending: false })
    .order("created_at", { ascending: false });

  // Um clube pode ter mais de um Acerto pra MESMA semana (import duplicado,
  // reimportação que não substituiu a existente) — sem isso, o WtR 4
  // Semanas contava a mesma semana várias vezes em vez de 4 semanas de
  // verdade (achado no caso Liga H&H). Mantém só o Acerto mais recente
  // (created_at) de cada semana, uma vez por clube.
  const semanasVistasPorClube = new Map<string, Set<string>>();
  for (const row of (data ?? []) as unknown as { club_external_id: string; player_result_cash: number; rake_cash: number; imports: { period_start: string | null } | null }[]) {
    const periodo = row.imports?.period_start ?? "";
    const semanasVistas = semanasVistasPorClube.get(row.club_external_id) ?? new Set<string>();
    if (semanasVistas.has(periodo)) continue;
    semanasVistas.add(periodo);
    semanasVistasPorClube.set(row.club_external_id, semanasVistas);

    const lista = mapa.get(row.club_external_id) ?? [];
    if (lista.length < 3) { lista.push({ player_result_cash: row.player_result_cash, rake_cash: row.rake_cash }); mapa.set(row.club_external_id, lista); }
  }
  return mapa;
}

// Razão das somas — confirmado com o Cássio: soma o Ganhos e soma o Rake das
// até-4 semanas primeiro, divide os totais uma vez só no final. NÃO é a
// média de cada razão semanal (essas duas contas dão resultados bem
// diferentes quando o Rake varia muito de semana pra semana). WtR é uma
// métrica de cash game — usa Ganhos de Cash / Rake Cash, não os totais
// (confirmado pelo Cássio: o WtR não batia porque estava misturando
// MTT/SpinUp na conta). Semana sem Rake Cash (plataforma sem essa quebra,
// ou clube que não jogou cash naquele período) simplesmente não entra na
// média, mesmo filtro que já existia pra rake zero.
export function calcularWtr4Semanas(row: ImportRow, historico: { player_result_cash: number; rake_cash: number }[]): number | null {
  const candidatos = [{ player_result_cash: row.player_result_cash ?? 0, rake_cash: row.rake_cash ?? 0 }, ...historico].filter((r) => r.rake_cash);
  if (candidatos.length === 0) return null;
  const somaGanhos = candidatos.reduce((s, r) => s + r.player_result_cash, 0);
  const somaRake = candidatos.reduce((s, r) => s + r.rake_cash, 0);
  return somaRake ? somaGanhos / somaRake : null;
}

// Um lançamento datado exatamente no 1º dia do período (period_start) conta
// pra semana ANTERIOR, não essa — confirmado pelo Cássio (achado no
// Agreste_Poker: uma Antecipação conciliada e datada bem na virada da
// semana — "o cara tá pagando da semana anterior" — estava contando na
// semana errada). Desloca a janela de data_lancamento inteira em +1 dia
// (start+1 até end+1), não só o limite inferior — assim uma data igual ao
// period_start da PRÓXIMA semana também sai da semana atual e vai pra lá,
// a regra vale "sucessivamente" pra toda virada, não só a de cima.
export function diaSeguinte(dataISO: string): string {
  const d = new Date(dataISO + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function maisDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Espelho de diaSeguinte — usado pra achar o period_end do período ANTERIOR
// a um period_start (períodos são semanas contíguas, sem buraco).
export function diaAnterior(dataISO: string): string {
  const d = new Date(dataISO + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Clubes cujo Acerto do período (achado pelo period_end) já foi 100% quitado
// por um Pagamento vinculado DIRETO (acerto_id, não por data) — usado pra
// decidir se uma Antecipação datada na semana seguinte a esse período ainda
// precisa deslocar pra trás pra ajudar a quitar essa Diferença, ou se ela já
// pode contar pra própria semana dela (ver buscarPendenciasAntecipacao e
// buscarAntecipacaoEnvios). Só olha Pagamento (o único tipo que grava
// acerto_id direto) — Antecipação nunca tem acerto_id, é sempre casada por
// data (por isso a pergunta "já foi quitado?" faz sentido em primeiro lugar).
//
// "Quitado" por padrão pra todo mundo (Set(clubIds) inteiro) — só sai da
// lista quem tem um Acerto de verdade nesse período AINDA devendo. Sem
// Acerto nenhum nesse period_end (clube não jogou essa semana, ou a Liga
// nem teve import nessa data) conta como quitado também — não tem Diferença
// nenhuma pra "ainda dever" (achado no INSTA PIX POK: sem Acerto pro
// period_end anterior, a função devolvia um Set vazio — todo mundo "não
// quitado" — e uma Antecipação dentro da própria semana ficava travada sem
// nenhum jeito de contar, nem pra trás, que também não tinha Acerto pra ir).
export async function clubesComDiferencaQuitada(clubIds: string[], periodEnd: string): Promise<Set<string>> {
  const quitados = new Set(clubIds);
  if (clubIds.length === 0 || !periodEnd) return quitados;

  const { data: importsData } = await supabase.from("imports").select("id").eq("period_end", periodEnd);
  const importIds = (importsData ?? []).map((i) => i.id as string);
  if (importIds.length === 0) return quitados;

  const { data: acertosData } = await supabase
    .from("acertos")
    .select("id, club_id, valor_acerto")
    .in("import_id", importIds)
    .in("club_id", clubIds);
  const porClube = new Map<string, { acertoId: string; valorAcerto: number }>();
  for (const a of (acertosData ?? []) as { id: string; club_id: string | null; valor_acerto: number }[]) {
    if (a.club_id) porClube.set(a.club_id, { acertoId: a.id, valorAcerto: a.valor_acerto });
  }
  if (porClube.size === 0) return quitados;

  const acertoIds = [...porClube.values()].map((v) => v.acertoId);
  // Só o lado Suporte, não o par da Genia — senão dobra o Valor Pago (mesma
  // regra usada em toda soma de Pagamento/Envio no resto do app).
  const { data: pagamentosData } = await supabase
    .from("lancamentos")
    .select("acerto_id, natureza, valor")
    .in("acerto_id", acertoIds)
    .eq("tipo", "pagamento")
    .eq("origem", "suporte");
  const pagoPorAcerto = new Map<string, number>();
  for (const p of (pagamentosData ?? []) as { acerto_id: string; natureza: "credito" | "debito"; valor: number }[]) {
    pagoPorAcerto.set(p.acerto_id, (pagoPorAcerto.get(p.acerto_id) ?? 0) + (p.natureza === "credito" ? p.valor : -p.valor));
  }
  for (const [clubId, { acertoId, valorAcerto }] of porClube) {
    const pago = pagoPorAcerto.get(acertoId) ?? 0;
    const resto = valorAcerto + pago;
    // "Quitado" não é só bater exatamente em zero — um Pagamento que
    // ultrapassa o que devia (acontece: o Suporte manda um valor redondo,
    // não centavo a centavo) também fecha a Diferença original, só que com
    // sobra pro outro lado (achado no AMORIM PLUS: Diferença de -11.243,40
    // fechada por um Pagamento de +11.977,22, sobrando +733,82 — mesmo assim
    // já não deve mais nada da semana original). Só continua "não quitado"
    // enquanto o resto ainda estiver do MESMO lado (sinal) da Diferença
    // original — sem Pagamento nenhum, resto === valorAcerto, cai aqui
    // igual sempre foi.
    const naoQuitado = valorAcerto > 0.005 ? resto > 0.005 : valorAcerto < -0.005 ? resto < -0.005 : false;
    if (naoQuitado) quitados.delete(clubId);
  }
  return quitados;
}

// Pendências/Antecipação = lançamentos de Antecipação do Suporte já
// conciliados (conciliado_com preenchido = já casou com o par da Genia) —
// confirmado com o Cássio. Soma só o lado Suporte (o real) e não o par da
// Genia, senão dobra o valor (mesma regra de origem já usada em
// Acertos/Extrato/ClubAcertoCard). Exportada porque AcertosView/ClubAcertoCard
// também chamam direto, ao vivo, em vez de confiar só no valor gravado em
// `acertos.pendencias_antecipacao` (que é uma foto de quando o Acerto foi
// calculado/recalculado pela última vez — achado pelo Cássio: uma
// Antecipação lançada/conciliada DEPOIS disso não aparecia até alguém
// clicar em "Recalcular").
//
// Duas fontes somam pro período P (periodStart–periodEnd):
//  1. Antecipação datada na semana INTEIRA seguinte a P (diaSeguinte(fim) a
//     fim+7) — o Suporte só sabe a Diferença de uma semana depois que ela
//     fecha, então um lançamento datado durante a semana seguinte está
//     pagando ESSA semana que já fechou (achado no Royal Star: Antecipação
//     datada 19-20/08 contando no Acerto 17-23 em vez do 10-16). MAS só
//     conta aqui se a Diferença de P AINDA não foi quitada por um Pagamento
//     vinculado direto — se já foi (caso Dont Do Mistakes: Pagamento de
//     317,35 fechou a Diferença de 317,35 do 10-16 certinho), essa
//     Antecipação não é "resto" nenhum de P, é adiantamento de verdade pra
//     semana seguinte, e conta lá (fonte 2 abaixo), não aqui.
//  2. Antecipação datada dentro do PRÓPRIO período P — só conta aqui se a
//     Diferença do período ANTERIOR a P já tiver sido quitada por Pagamento
//     vinculado (senão essa mesma Antecipação já foi contada lá, pela fonte
//     1 do período anterior — contar dos dois lados dobraria o valor).
export async function buscarPendenciasAntecipacao(clubIds: string[], periodStart: string, periodEnd: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (clubIds.length === 0 || !periodStart) return mapa;

  const fim = periodEnd || periodStart;
  const baseQuery = () =>
    supabase
      .from("lancamentos")
      .select("clube_id, natureza, valor")
      .in("clube_id", clubIds)
      .eq("tipo", "antecipacao")
      .eq("origem", "suporte")
      .not("conciliado_com", "is", null);

  const [{ data: deslocadas }, { data: proprias }, quitadoAtual, quitadoAnterior, arrastado] = await Promise.all([
    baseQuery().gte("data_lancamento", diaSeguinte(fim)).lte("data_lancamento", maisDias(fim, 7)),
    baseQuery().gte("data_lancamento", periodStart).lte("data_lancamento", fim),
    clubesComDiferencaQuitada(clubIds, fim),
    clubesComDiferencaQuitada(clubIds, diaAnterior(periodStart)),
    buscarSaldoArrastado(clubIds, fim),
  ]);

  for (const row of (deslocadas ?? []) as { clube_id: string; natureza: "credito" | "debito"; valor: number }[]) {
    if (quitadoAtual.has(row.clube_id)) continue;
    const delta = row.natureza === "credito" ? row.valor : -row.valor;
    mapa.set(row.clube_id, (mapa.get(row.clube_id) ?? 0) + delta);
  }
  for (const row of (proprias ?? []) as { clube_id: string; natureza: "credito" | "debito"; valor: number }[]) {
    if (!quitadoAnterior.has(row.clube_id)) continue;
    const delta = row.natureza === "credito" ? row.valor : -row.valor;
    mapa.set(row.clube_id, (mapa.get(row.clube_id) ?? 0) + delta);
  }
  for (const [clubId, valor] of arrastado) {
    mapa.set(clubId, (mapa.get(clubId) ?? 0) + valor);
  }
  return mapa;
}

// Saldo arrastado: soma de TODA Diferença que sobrou sem solução (nem
// Pagamento direto, nem Antecipação própria/deslocada) em QUALQUER período
// anterior desse clube — pedido do Cássio: "não pagou, tem que estar em
// pendência automaticamente, sem precisar de Rollover nem Recalcular".
// Antes disso, uma semana só "arrastava" se alguém clicasse Rollover
// manualmente (ver rolloverAcerto em lib/pagamentos.ts); sem isso, o valor
// simplesmente sumia — cada card só olhava a própria semana. Agora toda
// Diferença sem solução continua contando, empilhada, período após período,
// até ser paga de verdade (ou virar Dívida/Acordo, ação manual separada).
//
// Reaplica, num laço só por clube (dados buscados em lote, sem N+1), a MESMA
// conta de deslocada/própria/quitado que buscarPendenciasAntecipacao já faz
// pro período em exibição — só que rodando pra TODO período anterior ao
// `periodEnd` pedido, e SOMANDO o que sobrar de cada um (em vez de decidir
// visível/quitado só pro período atual). Cada período conta exatamente uma
// vez: deslocada(P) só entra se P não foi quitado por Pagamento direto,
// própria(P) só entra se o período ANTERIOR a P foi quitado por Pagamento
// direto — mesmo par de regras, pra não contar a mesma Antecipação duas
// vezes (uma como deslocada do período antigo, outra como própria do novo).
async function buscarSaldoArrastado(clubIds: string[], periodEnd: string): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (clubIds.length === 0 || !periodEnd) return mapa;

  const { data: acertosData } = await supabase
    .from("acertos")
    .select("id, club_id, valor_acerto, rollover_sem_multa, imports(period_start, period_end)")
    .in("club_id", clubIds);
  type AcertoComPeriodo = { id: string; club_id: string | null; valor_acerto: number; rollover_sem_multa: boolean | null; imports: { period_start: string; period_end: string } | { period_start: string; period_end: string }[] | null };
  type PeriodoClube = { acertoId: string; valorAcerto: number; start: string; end: string; semMulta: boolean };
  const porClube = new Map<string, PeriodoClube[]>();
  for (const a of (acertosData ?? []) as AcertoComPeriodo[]) {
    const imp = Array.isArray(a.imports) ? a.imports[0] : a.imports;
    if (!a.club_id || !imp || imp.period_end >= periodEnd) continue;
    const lista = porClube.get(a.club_id) ?? [];
    lista.push({ acertoId: a.id, valorAcerto: a.valor_acerto, start: imp.period_start, end: imp.period_end, semMulta: !!a.rollover_sem_multa });
    porClube.set(a.club_id, lista);
  }
  if (porClube.size === 0) return mapa;

  const clubIdsComHistorico = [...porClube.keys()];
  const todosAcertoIds = [...porClube.values()].flatMap((l) => l.map((r) => r.acertoId));
  const [{ data: pagamentosData }, { data: antecipData }] = await Promise.all([
    supabase.from("lancamentos").select("acerto_id, natureza, valor").in("acerto_id", todosAcertoIds).eq("tipo", "pagamento").eq("origem", "suporte"),
    supabase.from("lancamentos").select("clube_id, natureza, valor, data_lancamento").in("clube_id", clubIdsComHistorico).eq("tipo", "antecipacao").eq("origem", "suporte").not("conciliado_com", "is", null),
  ]);
  const pagoPorAcerto = new Map<string, number>();
  for (const p of (pagamentosData ?? []) as { acerto_id: string; natureza: "credito" | "debito"; valor: number }[]) {
    pagoPorAcerto.set(p.acerto_id, (pagoPorAcerto.get(p.acerto_id) ?? 0) + (p.natureza === "credito" ? p.valor : -p.valor));
  }
  const antecipPorClube = new Map<string, { natureza: "credito" | "debito"; valor: number; data: string }[]>();
  for (const r of (antecipData ?? []) as { clube_id: string; natureza: "credito" | "debito"; valor: number; data_lancamento: string }[]) {
    const lista = antecipPorClube.get(r.clube_id) ?? [];
    lista.push({ natureza: r.natureza, valor: r.valor, data: r.data_lancamento });
    antecipPorClube.set(r.clube_id, lista);
  }

  const faixasPorClube = new Map<string, Awaited<ReturnType<typeof getFaixasMultaDoClube>>>();
  await Promise.all(
    clubIdsComHistorico.map(async (clubId) => {
      // Isolado por clube: um erro buscando a Regra de Multa de UM clube
      // não pode derrubar o saldo arrastado (o valor sem multa nenhuma,
      // que já é o principal) de todos os outros clubes do mesmo lote.
      faixasPorClube.set(clubId, await getFaixasMultaDoClube(clubId).catch(() => []));
    })
  );

  for (const [clubId, periodos] of porClube) {
    periodos.sort((a, b) => a.end.localeCompare(b.end));
    const antecipacoes = antecipPorClube.get(clubId) ?? [];
    const faixas = faixasPorClube.get(clubId) ?? [];
    // Sem período nenhum antes do primeiro da lista: conta como "quitado" —
    // mesma regra de clubesComDiferencaQuitada (sem Acerto, nada devendo).
    let quitadoDiretoAnterior = true;
    let acumulado = 0;
    for (const p of periodos) {
      const pago = pagoPorAcerto.get(p.acertoId) ?? 0;
      const restoDireto = p.valorAcerto + pago;
      const quitadoDireto = p.valorAcerto > 0.005 ? restoDireto <= 0.005 : p.valorAcerto < -0.005 ? restoDireto >= -0.005 : true;
      const deslocadaIni = diaSeguinte(p.end);
      const deslocadaFim = maisDias(p.end, 7);
      let deslocada = 0;
      let propria = 0;
      for (const a of antecipacoes) {
        const delta = a.natureza === "credito" ? a.valor : -a.valor;
        if (!quitadoDireto && a.data >= deslocadaIni && a.data <= deslocadaFim) deslocada += delta;
        if (quitadoDiretoAnterior && a.data >= p.start && a.data <= p.end) propria += delta;
      }
      const restoPeriodo = restoDireto + deslocada + propria;
      // Multa por atraso: só sobre o que o CLUBE ainda deve (faz sentido
      // multar o clube por atraso, não a Liga) e só pra quem tem Regra de
      // Multa cadastrada (sem Regra, percentualMulta dá 0%, soma zero, sem
      // mudar nada pra quem nunca configurou). Cássio pediu: "a partir do
      // momento que atrasou, já tem que aparecer a multa" — sem precisar de
      // Rollover manual. `rollover_sem_multa` (marcado na tela Acertos
      // Pendentes) isenta esse período específico — Cássio, em áudio: "o
      // rollover é a opção dos dois lados, da negociação optarem por rolar
      // dívida pra próxima semana sem nenhum problema... não vai ter
      // multa". O saldo em si continua carregando normalmente, só a multa
      // desse período fica de fora.
      const multaDoPeriodo =
        restoPeriodo < -0.005 && faixas.length > 0 && !p.semMulta
          ? restoPeriodo * (percentualMulta(diasDeAtrasoDivida(p.end), faixas) / 100)
          : 0;
      acumulado += restoPeriodo + multaDoPeriodo;
      quitadoDiretoAnterior = quitadoDireto;
    }
    if (Math.abs(acumulado) > 0.005) mapa.set(clubId, acumulado);
  }
  return mapa;
}

// Mesma soma que processarAcertos grava em acertos.pendencias_antecipacao,
// só que ao vivo — pros lugares que preferem não confiar na foto gravada
// (ClubAcertoCard, Meus Acertos): uma Antecipação lançada/conciliada DEPOIS
// do último cálculo precisa aparecer sem esperar alguém clicar
// "Recalcular". Não depende mais do `importId` do Acerto exibido (Rollover
// não cria mais lançamento nenhum — ver rolloverAcerto em
// lib/pagamentos.ts — só marca `acertos.rollover_sem_multa`, lido direto em
// buscarSaldoArrastado) — por isso virou só um alias de
// buscarPendenciasAntecipacao.
export const buscarPendenciasEAntecipacaoAoVivo = buscarPendenciasAntecipacao;

export interface ClubeNovo {
  id: string;
  name: string;
  external_id: string;
}

export async function processarAcertos(importId: string): Promise<{
  success: boolean;
  count: number;
  error?: string;
  // Clubes que apareceram na planilha mas ainda não estavam cadastrados —
  // pré-cadastrados aqui do zero (nome, ID externo, liga), com taxas/regras
  // em branco (settlement_type cai no default 'taxa_dinamica' da tabela,
  // mas com fee_*_pct null vira tudo 0%, sem nenhum aviso de "sem_regra").
  // O chamador (AcertosView) mostra um aviso pedindo pra completar o
  // cadastro em Clubes antes de confiar no valor calculado dele.
  clubesNovos: ClubeNovo[];
}> {
  try {
    const { data: rows, error: rowsError } = await supabase
      .from("import_rows")
      .select("*")
      .eq("import_id", importId);

    if (rowsError) throw new Error(rowsError.message);
    // Arquivo só-Geral (Superagente/Agente/Jogador, sem Liga — ver
    // parsePPPoker) não gera linha nenhuma aqui de propósito (não é Acerto
    // de clube, só alimenta o rateio de Agentes) — antes isso caía nesse
    // guard e travava com "Nenhuma linha encontrada", impedindo até
    // processarAcertosAgentes de rodar (AcertosView só chama ele quando
    // processarAcertos retorna success). Sucesso com 0 clubes é o resultado
    // certo pra esse tipo de import, não um erro.
    if (!rows || rows.length === 0)
      return { success: true, count: 0, clubesNovos: [] };

    const { data: clubs, error: clubsError } = await supabase
      .from("clubs")
      .select("id, name, external_id, settlement_type, taxa_tipo, fee_mtt_pct, fee_cash_pct, taxa_op_pct, taxa_op_ativo, rebate_pct, crypto_rebate_pct, rakeback_pct, spinup_pct, wtr4_semanas_manual, league_id, cotacao");

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

    const acertos: AcertoCalculado[] = [];

    const clubesNovos: ClubeNovo[] = [];

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
                .select("id, name, external_id, settlement_type, taxa_tipo, fee_mtt_pct, fee_cash_pct, taxa_op_pct, taxa_op_ativo, rebate_pct, crypto_rebate_pct, rakeback_pct, spinup_pct, wtr4_semanas_manual, league_id, cotacao")
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
            player_result_cash: row.player_result_cash ?? 0,
            fee_calculado: 0, rebate_calculado: 0, valor_acerto: 0,
            fee_mtt_valor: 0, fee_cash_valor: 0, fee_operacional_valor: 0, fee_spinup_valor: 0, taxa_liga_valor: 0,
            taxa_cash_pct_aplicada: null,
            cotacao: null,
            status: "sem_regra",
          });
          continue;
        }

        club = novoClube as ClubSettings;
        clubByExtId.set(String(club.external_id), club);
        clubByName.set(club.name.toLowerCase().trim(), club);
        clubesNovos.push({ id: club.id, name: club.name, external_id: club.external_id });
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

    // Soma, não sobrescreve — um import pode ter mais de uma linha pro
    // mesmo club_external_id (ex: mapeamento genérico configurado por
    // jogador em vez de por clube); um Map construído direto do array
    // ficaria só com a última linha de cada clube, jogando fora as outras.
    const bilhetesPorClube = new Map<string, number>();
    for (const r of rows as ImportRow[]) {
      bilhetesPorClube.set(r.club_external_id, (bilhetesPorClube.get(r.club_external_id) ?? 0) + (r.bilhetes ?? 0));
    }
    const clubIdsResolvidos = [...new Set(acertos.map((a) => a.club_id).filter((id): id is string => !!id))];
    const pendenciasPorClube = await buscarPendenciasAntecipacao(
      clubIdsResolvidos,
      importInfo?.period_start ?? "",
      importInfo?.period_end ?? ""
    );

    // Bônus de Indicação (ver calcularIndicacao acima): club_indicacoes.club_id
    // é quem ganha o bônus, mas a base é o rake do club_indicado_id — cada
    // indicação usa o rake_total do respectivo clube indicado NESSE MESMO
    // período, e os valores em R$ de todas as indicações do clube somam.
    const { data: indicacoesData } = await supabase
      .from("club_indicacoes")
      .select("club_id, club_indicado_id, taxa_indicacao_pct")
      .in("club_id", clubIdsResolvidos);
    const rakeTotalPorClube = new Map<string, number>(
      acertos.filter((a) => a.club_id).map((a) => [a.club_id as string, a.rake_total])
    );
    const indicacaoValorPorClube = new Map<string, number>();
    for (const i of (indicacoesData ?? []) as { club_id: string; club_indicado_id: string | null; taxa_indicacao_pct: number }[]) {
      const rakeIndicado = i.club_indicado_id ? rakeTotalPorClube.get(i.club_indicado_id) ?? 0 : 0;
      const valor = calcularIndicacao(i.taxa_indicacao_pct ?? 0, rakeIndicado);
      indicacaoValorPorClube.set(i.club_id, (indicacaoValorPorClube.get(i.club_id) ?? 0) + valor);
    }

    const acertosComExtras = acertos.map((a) => ({
      ...a,
      bilhetes: bilhetesPorClube.get(a.club_external_id) ?? 0,
      pendencias_antecipacao: a.club_id ? pendenciasPorClube.get(a.club_id) ?? 0 : 0,
      indicacao_valor: a.club_id ? indicacaoValorPorClube.get(a.club_id) ?? 0 : 0,
    }));

    // Recalcular precisa ser UPDATE por clube, não "apaga tudo e insere de
    // novo": um delete em massa (.delete().eq("import_id", importId)) quebra
    // silenciosamente quando QUALQUER Acerto desse import já tem Pagamento/
    // Envio vinculado (lancamentos.acerto_id é FK) — o erro não era checado,
    // então o código seguia pro insert do mesmo jeito, empilhando Acertos
    // novos em cima dos antigos a cada clique em Recalcular (achado
    // investigando o PIXGAME, reportado pelo Cássio). Atualiza em cima da
    // mesma linha (mesmo id) quando o clube já tinha Acerto nesse import —
    // preserva o vínculo de Pagamento — e só insere linha nova pra clube
    // que ainda não tinha.
    const { data: acertosExistentes } = await supabase
      .from("acertos")
      .select("id, club_external_id")
      .eq("import_id", importId);
    const idExistentePorClube = new Map(
      ((acertosExistentes ?? []) as { id: string; club_external_id: string }[]).map((a) => [a.club_external_id, a.id])
    );

    const paraAtualizar = acertosComExtras.filter((a) => idExistentePorClube.has(a.club_external_id));
    const paraInserir = acertosComExtras.filter((a) => !idExistentePorClube.has(a.club_external_id));

    const resultadosUpdate = await Promise.all(
      paraAtualizar.map((a) =>
        supabase.from("acertos").update(a).eq("id", idExistentePorClube.get(a.club_external_id) as string)
      )
    );
    const updateErr = resultadosUpdate.find((r) => r.error)?.error;
    if (updateErr) throw new Error(updateErr.message);

    if (paraInserir.length > 0) {
      const { error: insertError } = await supabase.from("acertos").insert(paraInserir);
      if (insertError) throw new Error(insertError.message);
    }

    // Clube que tinha Acerto nesse import e sumiu da planilha recalculada
    // (raro — reimport com menos clubes) — apaga só a linha órfã dele, sem
    // mexer nas dos outros clubes.
    const clubesExternosAtuais = new Set(acertosComExtras.map((a) => a.club_external_id));
    const idsOrfaos = [...idExistentePorClube.entries()]
      .filter(([clubeExt]) => !clubesExternosAtuais.has(clubeExt))
      .map(([, id]) => id);
    if (idsOrfaos.length > 0) {
      await supabase.from("acertos").delete().in("id", idsOrfaos);
    }

    // Dívida/parcela marcada "Pagar com Rake" acabou de ter seu valor
    // descontado deste período (calcularTotalAcerto, chamado por quem exibe
    // o Acerto) — marca como paga agora, senão desconta de novo no próximo
    // import. Best-effort: os Acertos já foram salvos com sucesso acima,
    // isso não pode derrubar o processamento do import.
    try {
      const rakeTotalPorClube = new Map(
        acertosComExtras.filter((a) => a.club_id).map((a) => [a.club_id as string, a.rake_total])
      );
      await marcarDividasPagasComRake(clubIdsResolvidos, importInfo?.period_end || importInfo?.period_start || "", rakeTotalPorClube);
    } catch { /* best-effort */ }

    const semRegra = acertos.filter((a) => a.status === "sem_regra").length;
    await supabase
      .from("imports")
      .update({ status: semRegra > 0 ? "parcial" : "acertos_calculados" })
      .eq("id", importId);

    return { success: true, count: acertos.length, clubesNovos };
  } catch (err) {
    return { success: false, count: 0, error: err instanceof Error ? err.message : "Erro", clubesNovos: [] };
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

    // Repasse pro Superagente: soma o rake de cada Agente também na linha do
    // Superagente dele (mesmo clube) — Superagente é só um Agente sem
    // superagente_id (mesma tabela `agentes`), então ganha uma linha própria
    // em acertos_agentes igual qualquer Agente, com o % de rakeback dele
    // (clube_agentes). Jogador sem Agente no meio (reporta direto pro
    // Superagente) já entra direto na linha dele — ver
    // harmonizar-import/index.ts (agenteEfetivoId) — esse passo só cobre
    // quem tem Agente cadastrado. Hierarquia é só 1 nível (Superagente >
    // Agente), sem repasse encadeado.
    const agenteIdsDiretos = [...new Set([...grupos.values()].map((g) => g.agente_id))];
    const { data: agentesInfo } = await supabase.from("agentes").select("id, superagente_id").in("id", agenteIdsDiretos);
    const superagentePorAgente = new Map((agentesInfo ?? []).map((a) => [a.id as string, a.superagente_id as string | null]));

    for (const g of [...grupos.values()]) {
      const superagenteId = superagentePorAgente.get(g.agente_id);
      if (!superagenteId) continue;
      const chaveSuper = `${superagenteId}:${g.clube_id ?? "sem_clube"}`;
      const atual = grupos.get(chaveSuper) ?? { agente_id: superagenteId, clube_id: g.clube_id, rake_total: 0 };
      atual.rake_total += g.rake_total;
      grupos.set(chaveSuper, atual);
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

import { supabase } from "@/lib/supabase";

export interface ClubSettings {
  id: string;
  name: string;
  external_id: string;
  settlement_type: string;
  fee_mtt_pct: number;
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

function calcularAcerto(row: ImportRow, club: ClubSettings): AcertoCalculado {
  let fee_calculado = 0;
  let rebate_calculado = 0;
  let valor_acerto = 0;

  const rake_mtt    = Math.abs(row.rake_mtt ?? 0);
  const rake_cash   = Math.abs(row.rake_cash ?? 0);
  const rake_spinup = Math.abs(row.rake_spinup ?? 0);
  const rake_total  = Math.abs(row.rake_total ?? 0);

  switch (club.settlement_type) {
    case "taxa_dinamica":
      fee_calculado =
        rake_mtt    * (club.fee_mtt_pct  / 100) +
        rake_cash   * (club.taxa_op_pct  / 100) +
        rake_spinup * ((club.spinup_pct ?? 0) / 100);
      valor_acerto = fee_calculado;
      break;
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
      .select("id, name, external_id, settlement_type, fee_mtt_pct, taxa_op_pct, rebate_pct, crypto_rebate_pct, rakeback_pct, spinup_pct");

    if (clubsError) throw new Error(clubsError.message);

    const clubByExtId = new Map<string, ClubSettings>(
      (clubs ?? []).filter((c) => c.external_id).map((c) => [String(c.external_id), c])
    );
    const clubByName = new Map<string, ClubSettings>(
      (clubs ?? []).map((c) => [c.name.toLowerCase().trim(), c])
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
          status: "sem_regra",
        });
        continue;
      }
      acertos.push(calcularAcerto(row as ImportRow, club));
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

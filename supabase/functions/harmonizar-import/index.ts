// Edge Function: harmonizar-import
// Disparada via Database Webhook assim que uma linha nova cai em `bronze_rows`.
// Lê o payload cru (já parseado no navegador) e escreve nas tabelas
// normalizadas (import_rows, jogadores, agentes, clubes, vínculos).
// Se algo falhar, marca `imports.harmonization_status = 'erro'` com o
// detalhe — o arquivo e os dados crus continuam intactos na bronze pra
// reprocessar depois, sem precisar pedir reimport pro usuário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ImportRow {
  club_name: string;
  club_external_id: string;
  rake_total: number;
  rake_mtt: number;
  rake_cash: number;
  rake_spinup: number;
  fee_total: number;
  player_result: number;
  agente_nome: string;
  agente_id_ext: string;
  superagente_nome: string;
  superagente_id_ext: string;
  raw_data: Record<string, unknown>;
}

interface JogadorRow {
  jogador_id_ext: string;
  jogador_apelido: string;
  jogador_memo: string;
  agente_nome: string;
  agente_id_ext: string;
  superagente_nome: string;
  superagente_id_ext: string;
  player_result: number;
  rake_clube: number;
  clube_nome: string;
  clube_id_ext: string;
}

interface BronzePayload {
  plataforma: string;
  rows: ImportRow[];
  jogadores: JogadorRow[];
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function getOrNullClube(supabase: ReturnType<typeof createClient>, externalId: string): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await supabase.from("clubs").select("id").eq("external_id", externalId).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function processarJogadores(
  supabase: ReturnType<typeof createClient>,
  importId: string,
  plataformaId: string,
  jogadores: JogadorRow[]
): Promise<{ ok: number; erros: string[] }> {
  let ok = 0;
  const erros: string[] = [];

  for (const j of jogadores) {
    try {
      let superagenteId: string | null = null;
      if (j.superagente_id_ext) {
        const { data: sa } = await supabase
          .from("agentes")
          .upsert(
            { nome: j.superagente_nome || j.superagente_id_ext, external_id: j.superagente_id_ext, plataforma_id: plataformaId },
            { onConflict: "external_id,plataforma_id", ignoreDuplicates: false }
          )
          .select("id")
          .single();
        if (sa) {
          superagenteId = (sa as { id: string }).id;
          await supabase.from("agente_plataformas").upsert(
            { agente_id: superagenteId, plataforma_id: plataformaId, external_id: j.superagente_id_ext, nickname: j.superagente_nome || null },
            { onConflict: "plataforma_id,external_id", ignoreDuplicates: false }
          );
        }
      }

      let agenteId: string | null = null;
      if (j.agente_id_ext) {
        const { data: ag } = await supabase
          .from("agentes")
          .upsert(
            { nome: j.agente_nome || j.agente_id_ext, external_id: j.agente_id_ext, plataforma_id: plataformaId, superagente_id: superagenteId },
            { onConflict: "external_id,plataforma_id", ignoreDuplicates: false }
          )
          .select("id")
          .single();
        if (ag) {
          agenteId = (ag as { id: string }).id;
          await supabase.from("agente_plataformas").upsert(
            { agente_id: agenteId, plataforma_id: plataformaId, external_id: j.agente_id_ext, nickname: j.agente_nome || null },
            { onConflict: "plataforma_id,external_id", ignoreDuplicates: false }
          );
          if (superagenteId) {
            await supabase.from("clube_agentes").upsert(
              { clube_id: await getOrNullClube(supabase, j.clube_id_ext), agente_id: superagenteId },
              { onConflict: "clube_id,agente_id", ignoreDuplicates: true }
            );
          }
        }
      }

      const nomeJogador = j.jogador_memo || j.jogador_apelido || j.jogador_id_ext;
      const { data: jog } = await supabase
        .from("jogadores")
        .upsert(
          { nome: nomeJogador, external_id: j.jogador_id_ext, plataforma_id: plataformaId },
          { onConflict: "external_id,plataforma_id", ignoreDuplicates: false }
        )
        .select("id")
        .single();

      if (!jog) continue;
      const jogadorId = (jog as { id: string }).id;

      const clubeId = await getOrNullClube(supabase, j.clube_id_ext);

      if (agenteId) {
        await supabase.from("agente_jogadores").upsert(
          { agente_id: agenteId, jogador_id: jogadorId },
          { onConflict: "agente_id,jogador_id", ignoreDuplicates: true }
        );
      }

      if (clubeId) {
        await supabase.from("clube_jogadores").upsert(
          { clube_id: clubeId, jogador_id: jogadorId },
          { onConflict: "clube_id,jogador_id", ignoreDuplicates: true }
        );
        if (agenteId) {
          await supabase.from("clube_agentes").upsert(
            { clube_id: clubeId, agente_id: agenteId },
            { onConflict: "clube_id,agente_id", ignoreDuplicates: true }
          );
        }
      }

      await supabase.from("import_jogadores").upsert(
        {
          import_id: importId,
          jogador_id: jogadorId,
          clube_id: clubeId,
          agente_id: agenteId,
          player_result: j.player_result,
          rake_total: j.rake_clube,
        },
        { onConflict: "import_id,jogador_id", ignoreDuplicates: false }
      );

      ok++;
    } catch (e) {
      erros.push(`Jogador ${j.jogador_id_ext}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok, erros };
}

Deno.serve(async (req) => {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { bronze_row_id, import_id } = await req.json();

    const { data: bronzeRow, error: bronzeErr } = await supabase
      .from("bronze_rows")
      .select("payload")
      .eq("id", bronze_row_id)
      .single();
    if (bronzeErr || !bronzeRow) throw new Error(`bronze_row não encontrada: ${bronzeErr?.message ?? bronze_row_id}`);

    const { data: importRow, error: importErr } = await supabase
      .from("imports")
      .select("id, plataforma_id")
      .eq("id", import_id)
      .single();
    if (importErr || !importRow) throw new Error(`import não encontrado: ${importErr?.message ?? import_id}`);

    await supabase.from("imports").update({ harmonization_status: "processando" }).eq("id", import_id);

    const payload = (bronzeRow as { payload: BronzePayload }).payload;
    const plataformaId = (importRow as { plataforma_id: string }).plataforma_id;

    const { error: rowsErr } = await supabase.from("import_rows").insert(
      payload.rows.map((row) => ({
        import_id,
        club_name: row.club_name,
        club_external_id: row.club_external_id,
        rake_total: row.rake_total,
        rake_mtt: row.rake_mtt,
        rake_cash: row.rake_cash,
        rake_spinup: row.rake_spinup,
        fee_total: row.fee_total,
        player_result: row.player_result,
        agente_nome: row.agente_nome || null,
        agente_id_ext: row.agente_id_ext || null,
        superagente_nome: row.superagente_nome || null,
        superagente_id_ext: row.superagente_id_ext || null,
        raw_data: row.raw_data,
      }))
    );
    if (rowsErr) throw new Error(`Erro ao salvar linhas: ${rowsErr.message}`);

    let stats = { ok: 0, erros: [] as string[] };
    if (payload.jogadores.length > 0) {
      stats = await processarJogadores(supabase, import_id, plataformaId, payload.jogadores);
    }

    await supabase
      .from("imports")
      .update({
        status: "done",
        harmonization_status: "harmonizado",
        harmonized_at: new Date().toISOString(),
        jogadores_ok: stats.ok,
        harmonization_error: stats.erros.length > 0 ? `${stats.erros.length} jogador(es) com erro: ${stats.erros.slice(0, 5).join("; ")}` : null,
      })
      .eq("id", import_id);

    return new Response(JSON.stringify({ ok: true, jogadores_ok: stats.ok, jogadores_erro: stats.erros.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const body = await req.clone().json().catch(() => null);
    if (body?.import_id) {
      await supabase
        .from("imports")
        .update({ status: "error", harmonization_status: "erro", harmonization_error: message })
        .eq("id", body.import_id);
    }
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

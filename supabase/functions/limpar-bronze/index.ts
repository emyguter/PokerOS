// Edge Function: limpar-bronze
// Chamada uma vez por dia via pg_cron. Apaga o arquivo original (Storage)
// e as linhas cruas (bronze_rows) de importações já harmonizadas (ou que
// falharam) há mais de RETENCAO_DIAS dias. O registro em `imports` e os
// dados já normalizados (import_rows, jogadores, etc.) NUNCA são apagados
// — só o material bruto que não serve mais pra reprocessar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RETENCAO_DIAS = 7;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const limite = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: harmonizados } = await supabase
      .from("imports")
      .select("id, storage_path")
      .eq("harmonization_status", "harmonizado")
      .lt("harmonized_at", limite);

    const { data: comErro } = await supabase
      .from("imports")
      .select("id, storage_path")
      .eq("harmonization_status", "erro")
      .lt("created_at", limite);

    const alvos = [...(harmonizados ?? []), ...(comErro ?? [])] as { id: string; storage_path: string | null }[];

    let arquivosApagados = 0;
    let linhasApagadas = 0;

    for (const imp of alvos) {
      if (imp.storage_path) {
        const { error: storageErr } = await supabase.storage.from("bronze-uploads").remove([imp.storage_path]);
        if (!storageErr) arquivosApagados++;
      }
      const { count } = await supabase.from("bronze_rows").delete({ count: "exact" }).eq("import_id", imp.id);
      linhasApagadas += count ?? 0;
    }

    return new Response(
      JSON.stringify({ ok: true, imports_processados: alvos.length, arquivos_apagados: arquivosApagados, linhas_bronze_apagadas: linhasApagadas }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

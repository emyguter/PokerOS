// Edge Function: criar-usuario
// Chamada pela tela de Permissões (só super admin) pra criar um login novo
// de ponta a ponta: usuário no Supabase Auth + profile já configurado
// (staff com papéis, ou login travado num clube). Precisa da service role
// key porque criar usuário via Admin API não dá pra fazer com a anon key
// no navegador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Chamada direto do navegador (não por webhook/cron como as outras functions),
// então precisa responder o preflight OPTIONS e mandar os headers de CORS em
// toda resposta — senão o browser bloqueia antes de a requisição sair.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  email: string;
  password: string;
  nome?: string;
  tipoAcesso: "staff" | "clube" | "agente";
  isSuperAdmin?: boolean;
  clubeId?: string;
  agenteId?: string;
  roleIds?: string[];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: callerData, error: callerErr } = await admin.auth.getUser(jwt);
    if (callerErr || !callerData.user) {
      return jsonResponse({ ok: false, error: "Não autenticado." }, 401);
    }

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (!(callerProfile as { is_super_admin: boolean } | null)?.is_super_admin) {
      return jsonResponse({ ok: false, error: "Só super admin pode criar usuário." }, 403);
    }

    const body = (await req.json()) as Body;
    if (!body.email || !body.password) {
      return jsonResponse({ ok: false, error: "Email e senha são obrigatórios." }, 400);
    }
    const ehClube = body.tipoAcesso === "clube";
    const ehAgente = body.tipoAcesso === "agente";
    if (ehClube && !body.clubeId) {
      return jsonResponse({ ok: false, error: "Escolha o clube." }, 400);
    }
    if (ehAgente && !body.agenteId) {
      return jsonResponse({ ok: false, error: "Escolha o agente." }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return jsonResponse({ ok: false, error: createErr?.message ?? "Erro ao criar usuário." }, 400);
    }
    const novoId = created.user.id;

    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        nome: body.nome || null,
        is_super_admin: ehClube || ehAgente ? false : !!body.isSuperAdmin,
        clube_id: ehClube ? body.clubeId : null,
        agente_id: ehAgente ? body.agenteId : null,
      })
      .eq("id", novoId);
    if (profileErr) throw new Error(`Usuário criado, mas erro ao configurar acesso: ${profileErr.message}`);

    if (!ehClube && !ehAgente && body.roleIds && body.roleIds.length > 0) {
      const { error: rolesErr } = await admin
        .from("user_roles")
        .insert(body.roleIds.map((role_id) => ({ user_id: novoId, role_id })));
      if (rolesErr) throw new Error(`Usuário criado, mas erro ao atribuir papéis: ${rolesErr.message}`);
    }

    return jsonResponse({ ok: true, id: novoId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

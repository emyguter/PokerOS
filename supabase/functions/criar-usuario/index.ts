// Edge Function: criar-usuario
// Chamada pela tela de Permissões (só super admin) pra criar um login novo
// de ponta a ponta: usuário no Supabase Auth + profile já configurado
// (staff com papéis, ou login travado num clube). Precisa da service role
// key porque criar usuário via Admin API não dá pra fazer com a anon key
// no navegador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  email: string;
  password: string;
  nome?: string;
  tipoAcesso: "staff" | "clube";
  isSuperAdmin?: boolean;
  clubeId?: string;
  roleIds?: string[];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
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
    if (ehClube && !body.clubeId) {
      return jsonResponse({ ok: false, error: "Escolha o clube." }, 400);
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
        is_super_admin: ehClube ? false : !!body.isSuperAdmin,
        clube_id: ehClube ? body.clubeId : null,
      })
      .eq("id", novoId);
    if (profileErr) throw new Error(`Usuário criado, mas erro ao configurar acesso: ${profileErr.message}`);

    if (!ehClube && body.roleIds && body.roleIds.length > 0) {
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

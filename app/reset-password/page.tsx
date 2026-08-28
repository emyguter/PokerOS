"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { t } = useI18n();
  const readyRef = useRef(false);

  // O link do email carrega o token de recuperação na URL — o cliente
  // Supabase processa ele sozinho (detectSessionInUrl) e dispara esse
  // evento assim que a sessão de recuperação fica pronta. Sem sessão
  // nenhuma depois de um tempo, o link já expirou ou foi usado.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { readyRef.current = true; setReady(true); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { readyRef.current = true; setReady(true); }
    });
    const timer = setTimeout(() => { if (!readyRef.current) setInvalid(true); }, 4000);
    return () => { listener.subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) { setError(t("reset_password_page.senha_curta")); return; }
    if (password !== confirm) { setError(t("reset_password_page.senhas_diferentes")); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) { setError(t("reset_password_page.erro_salvar")); return; }

    setDone(true);
    setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from("profiles").select("clube_id, agente_id").eq("id", user.id).maybeSingle()
        : { data: null };
      if (profile?.clube_id) router.push("/extrato");
      else if (profile?.agente_id) router.push("/agente/extrato");
      else router.push("/admin/cadastro/superligas");
    }, 1200);
  }

  return (
    <div style={{
      fontFamily: "var(--font-sans), sans-serif",
      background: "#0C0E0B",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#F0EDE4",
    }}>
      <style>{`
        .input-field {
          background: #111510;
          color: #F0EDE4;
          border: 1px solid #2a2c20;
          border-radius: 8px;
          padding: 12px 16px;
          font-family: var(--font-sans), sans-serif;
          font-size: 14px;
          width: 100%;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .input-field:focus { border-color: #C9A84C; }
        .btn-login {
          background: #C9A84C;
          color: #0C0E0B;
          border: none;
          border-radius: 8px;
          padding: 13px;
          font-family: var(--font-sans), sans-serif;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          width: 100%;
          transition: opacity 0.15s;
        }
        .btn-login:hover { opacity: 0.85; }
        .btn-login:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 400, padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56,
            background: "#111510",
            border: "1px solid #C9A84C",
            borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, color: "#C9A84C",
            margin: "0 auto 16px",
          }}>◆</div>
          <h1 style={{ fontFamily: "var(--font-display), serif", fontSize: 26, fontWeight: 600, margin: "0 0 4px" }}>PokerOS</h1>
        </div>

        <div style={{
          background: "#111510",
          border: "1px solid #1e2018",
          borderRadius: 14,
          padding: 32,
        }}>
          {invalid && !ready ? (
            <p style={{ color: "#E07070", fontSize: 13, margin: 0 }}>{t("reset_password_page.link_invalido")}</p>
          ) : done ? (
            <p style={{ color: "#7DC97D", fontSize: 14, margin: 0 }}>{t("reset_password_page.senha_atualizada")}</p>
          ) : (
            <>
              <h2 style={{ fontFamily: "var(--font-display), serif", fontSize: 20, fontWeight: 500, margin: "0 0 8px" }}>{t("reset_password_page.titulo")}</h2>
              <p style={{ color: "#8a8a80", fontSize: 13, margin: "0 0 24px" }}>{t("reset_password_page.desc")}</p>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>{t("reset_password_page.nova_senha_label")}</p>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>{t("reset_password_page.confirmar_senha_label")}</p>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div style={{ background: "#1a0f0f", border: "1px solid #5a2020", borderRadius: 8, padding: "10px 14px" }}>
                    <p style={{ color: "#E07070", fontSize: 13, margin: 0 }}>{error}</p>
                  </div>
                )}

                <button className="btn-login" type="submit" disabled={loading || !ready}>
                  {loading ? t("reset_password_page.salvando") : t("reset_password_page.salvar_senha")}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

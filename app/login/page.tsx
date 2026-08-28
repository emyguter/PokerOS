"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "forgot" | "trocada">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotError("");

    if (novaSenha.length < 6) {
      setForgotError(t("login.senha_curta"));
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setForgotError(t("login.senhas_diferentes"));
      return;
    }

    setForgotLoading(true);
    const { data, error } = await supabase.rpc("redefinir_senha_direta", {
      p_email: forgotEmail,
      p_nova_senha: novaSenha,
    });
    setForgotLoading(false);

    if (error || data === false) {
      // Mesma mensagem tanto pra erro real quanto pra email sem conta —
      // evita revelar quais emails têm cadastro no sistema.
      setForgotError(t("login.erro_redefinir"));
      return;
    }

    setEmail(forgotEmail);
    setPassword("");
    setMode("trocada");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(t("login.erro"));
      setLoading(false);
      return;
    }

    // Login de clube/agente é uma experiência travada (Sidebar esconde o menu
    // de staff pra eles) — manda direto pro único destino que faz sentido, em
    // vez de cair no Cadastro e bater na tela de "sem permissão".
    const { data: profile } = await supabase
      .from("profiles")
      .select("clube_id, agente_id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profile?.clube_id) router.push("/extrato");
    else if (profile?.agente_id) router.push("/agente/extrato");
    else router.push("/admin/cadastro/superligas");
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
      position: "relative",
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

      <div
        style={{
          position: "absolute", top: 20, right: 20,
          background: "#111510", border: "1px solid #2a2c20", borderRadius: 6,
          padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "#8a8a80",
          display: "flex", gap: 6, alignItems: "center",
        }}
      >
        <button type="button" onClick={() => setLocale("pt")} title="Português" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 600, color: locale === "pt" ? "#C9A84C" : "#8a8a80" }}>PT</button>
        <span style={{ color: "#4a4a44" }}>/</span>
        <button type="button" onClick={() => setLocale("en")} title="English" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 600, color: locale === "en" ? "#C9A84C" : "#8a8a80" }}>EN</button>
        <span style={{ color: "#4a4a44" }}>/</span>
        <button type="button" onClick={() => setLocale("es")} title="Español" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 600, color: locale === "es" ? "#C9A84C" : "#8a8a80" }}>ES</button>
      </div>

      <div style={{ width: "100%", maxWidth: 400, padding: "0 24px" }}>

        {/* Logo */}
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
          <p style={{ color: "#5a5a52", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>League Platform</p>
        </div>

        {/* Card */}
        <div style={{
          background: "#111510",
          border: "1px solid #1e2018",
          borderRadius: 14,
          padding: 32,
        }}>
          {mode === "login" && (
            <>
              <h2 style={{ fontFamily: "var(--font-display), serif", fontSize: 20, fontWeight: 500, margin: "0 0 24px" }}>{t("login.entrar")}</h2>

              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>{t("login.email")}</p>
                  <input
                    className="input-field"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>{t("login.senha")}</p>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div style={{ background: "#1a0f0f", border: "1px solid #5a2020", borderRadius: 8, padding: "10px 14px" }}>
                    <p style={{ color: "#E07070", fontSize: 13, margin: 0 }}>{error}</p>
                  </div>
                )}

                <button className="btn-login" type="submit" disabled={loading}>
                  {loading ? t("login.entrando") : t("login.entrar")}
                </button>

                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setForgotEmail(email); setNovaSenha(""); setConfirmarSenha(""); setForgotError(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, color: "#8a8a80", textAlign: "center" }}
                >
                  {t("login.esqueci_senha")}
                </button>
              </form>
            </>
          )}

          {mode === "forgot" && (
            <>
              <h2 style={{ fontFamily: "var(--font-display), serif", fontSize: 20, fontWeight: 500, margin: "0 0 8px" }}>{t("login.redefinir_titulo")}</h2>
              <p style={{ color: "#8a8a80", fontSize: 13, margin: "0 0 24px" }}>{t("login.redefinir_desc")}</p>

              <form onSubmit={handleForgotPassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>{t("login.email")}</p>
                  <input
                    className="input-field"
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>{t("login.nova_senha_label")}</p>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="••••••••"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>{t("login.confirmar_senha_label")}</p>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="••••••••"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    required
                  />
                </div>

                {forgotError && (
                  <div style={{ background: "#1a0f0f", border: "1px solid #5a2020", borderRadius: 8, padding: "10px 14px" }}>
                    <p style={{ color: "#E07070", fontSize: 13, margin: 0 }}>{forgotError}</p>
                  </div>
                )}

                <button className="btn-login" type="submit" disabled={forgotLoading}>
                  {forgotLoading ? t("login.redefinindo") : t("login.redefinir_senha_button")}
                </button>

                <button
                  type="button"
                  onClick={() => setMode("login")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, color: "#8a8a80", textAlign: "center" }}
                >
                  {t("login.voltar_login")}
                </button>
              </form>
            </>
          )}

          {mode === "trocada" && (
            <>
              <h2 style={{ fontFamily: "var(--font-display), serif", fontSize: 20, fontWeight: 500, margin: "0 0 8px" }}>{t("login.senha_alterada_titulo")}</h2>
              <p style={{ color: "#8a8a80", fontSize: 13, margin: "0 0 24px" }}>{t("login.senha_alterada_desc")}</p>

              <button
                type="button"
                className="btn-login"
                onClick={() => setMode("login")}
              >
                {t("login.senha_alterada_botao")}
              </button>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", color: "#3a3a32", fontSize: 12, marginTop: 24 }}>
          {t("login.tagline")}
        </p>
      </div>
    </div>
  );
}

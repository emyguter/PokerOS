"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Email ou senha incorretos.");
      setLoading(false);
      return;
    }

    router.push("/admin/cadastro/superligas");
  }

  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      background: "#0C0E0B",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#F0EDE4",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        .input-field {
          background: #111410;
          color: #F0EDE4;
          border: 1px solid #2a2c20;
          border-radius: 8px;
          padding: 12px 16px;
          font-family: 'DM Sans', sans-serif;
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
          font-family: 'DM Sans', sans-serif;
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

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56,
            background: "#111410",
            border: "1px solid #C9A84C",
            borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, color: "#C9A84C",
            margin: "0 auto 16px",
          }}>◆</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 600, margin: "0 0 4px" }}>PokerOS</h1>
          <p style={{ color: "#5a5a52", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>League Platform</p>
        </div>

        {/* Card */}
        <div style={{
          background: "#111410",
          border: "1px solid #1e2018",
          borderRadius: 14,
          padding: 32,
        }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, margin: "0 0 24px" }}>Entrar</h2>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>Email</p>
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
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5a5a52", margin: "0 0 6px" }}>Senha</p>
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
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", color: "#3a3a32", fontSize: 12, marginTop: 24 }}>
          From game data to financial settlements — automatically.
        </p>
      </div>
    </div>
  );
}

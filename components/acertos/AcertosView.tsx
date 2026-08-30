"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ArvoreAcertosView } from "./ArvoreAcertosView";
import { AgentesAcertosView } from "./AgentesAcertosView";

// Tela de Acertos pro staff/admin (sem vínculo de entidade — ver
// app/acertos/page.tsx). "Clube" é a Árvore de Acertos (Liga → Clube →
// Super Agente → Agente → Jogador, ver ArvoreAcertosView) — substituiu a
// antiga lista de imports pra selecionar um por vez. "Agente" continua a
// visão plana de todos os agentes cruzando clubes (útil pra comparar
// rakeback entre agentes sem entrar clube por clube, coisa que a árvore
// não responde de cara).
export default function AcertosView() {
  const { t } = useI18n();
  const [aba, setAba] = useState<"clube" | "agente">("clube");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: "#C9A84C", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{t('acertos_view.kicker')}</p>
        <h1 style={{ fontFamily: "var(--font-display), serif", fontSize: 28, fontWeight: 600, margin: 0 }}>{t('acertos_view.titulo')}</h1>
        <p style={{ color: "#6a6a62", fontSize: 14, marginTop: 6 }}>
          {aba === "clube" ? t('acertos_view.subtitulo_clube') : t('acertos_view.subtitulo_agente')}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, maxWidth: 1300 }}>
        <button
          onClick={() => setAba("clube")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === "clube" ? "bg-gold text-surface" : "text-gray-400 border border-white/10 hover:text-white hover:border-white/20"}`}
        >
          {t('acertos_view.aba_clube')}
        </button>
        <button
          onClick={() => setAba("agente")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === "agente" ? "bg-gold text-surface" : "text-gray-400 border border-white/10 hover:text-white hover:border-white/20"}`}
        >
          {t('acertos_view.aba_agente')}
        </button>
      </div>

      {aba === "agente" ? <AgentesAcertosView /> : <ArvoreAcertosView />}
    </div>
  );
}

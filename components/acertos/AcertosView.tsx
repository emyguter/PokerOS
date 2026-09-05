"use client";

import { useI18n } from "@/lib/i18n";
import { ArvoreAcertosView } from "./ArvoreAcertosView";

// Tela de Acertos pro staff/admin (sem vínculo de entidade — ver
// app/acertos/page.tsx). É só a Árvore de Acertos (Liga → Clube → Super
// Agente → Agente → Jogador, ver ArvoreAcertosView) — a antiga aba "Por
// Agente" (visão plana cruzando clubes) saiu por ser redundante com o
// drill-down de Agente que a árvore já tem dentro de cada Clube (pedido do
// Cássio: duas abas em cima de uma árvore que já mostra as duas coisas
// juntas só confundia). AgentesAcertosView.tsx continua existindo — ainda é
// usado no extrato do próprio Agente (app/agente/extrato), visão diferente
// (o Agente vendo só o rakeback dele, não uma comparação entre agentes).
export default function AcertosView() {
  const { t } = useI18n();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: "#C9A84C", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{t('acertos_view.kicker')}</p>
        <h1 style={{ fontFamily: "var(--font-display), serif", fontSize: 28, fontWeight: 600, margin: 0 }}>{t('acertos_view.titulo')}</h1>
      </div>

      <ArvoreAcertosView />
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { processarAcertos } from "@/lib/acertos-engine";
import * as XLSX from "xlsx";
import { ClubAcertoCard } from "./ClubAcertoCard";

interface Import {
  id: string;
  file_name: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
  leagues: { name: string } | null;
}

interface Acerto {
  id: string;
  club_id: string | null;
  club_name: string;
  club_external_id: string;
  settlement_type: string;
  rake_total: number;
  rake_mtt: number;
  rake_cash: number;
  rake_spinup: number;
  player_result: number;
  fee_calculado: number;
  rebate_calculado: number;
  valor_acerto: number;
  status: string;
  fee_mtt_valor: number;
  fee_cash_valor: number;
  fee_operacional_valor: number;
  fee_spinup_valor: number;
  taxa_cash_pct_aplicada: number | null;
  bilhetes: number;
  pendencias_antecipacao: number;
  taxa_aa_home_game: number;
}

const LABELS: Record<string, string> = {
  taxa_dinamica: "Taxa Dinâmica",
  taxa_fixa_variavel: "Taxa Fixa/Var",
  rakeback: "Rakeback",
  weekly_usd: "Weekly USD",
  sem_regra: "Sem Regra",
};

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Fee é sempre o que a liga cobra do clube — mostra sempre negativo. Pros
// modelos onde o acerto é só a fee (taxa_dinamica, taxa_fixa_variavel),
// o "Valor Acerto" fica negativo junto (é o mesmo número). Pros modelos com
// rebate (rakeback, weekly_usd) o sinal do acerto já reflete corretamente
// quem deve pra quem, então fica como calculado.
const isFeeType = (a: Acerto) => a.settlement_type === "taxa_dinamica" || a.settlement_type === "taxa_fixa_variavel";
const feeDisplay = (a: Acerto) => -Math.abs(a.fee_calculado);
const valorDisplay = (a: Acerto) => (isFeeType(a) ? -a.valor_acerto : a.valor_acerto);

export default function AcertosView() {
  const [imports, setImports] = useState<Import[]>([]);
  const [selected, setSelected] = useState<Import | null>(null);
  const [acertos, setAcertos] = useState<Acerto[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [filterType, setFilterType] = useState("todos");
  const [search, setSearch] = useState("");
  const [cardAberto, setCardAberto] = useState<Acerto | null>(null);

  useEffect(() => { loadImports(); }, []);

  async function loadImports() {
    const { data } = await supabase
      .from("imports")
      .select("*, leagues(name)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setImports(data as Import[]);
  }

  const loadAcertos = useCallback(async (importId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("acertos")
      .select("*")
      .eq("import_id", importId)
      .order("valor_acerto", { ascending: false });
    setAcertos((data as Acerto[]) ?? []);
    setLoading(false);
  }, []);

  async function handleSelect(imp: Import) {
    setSelected(imp);
    setFilterType("todos");
    setSearch("");
    await loadAcertos(imp.id);
  }

  async function handleCalcular() {
    if (!selected) return;
    setCalculating(true);
    const result = await processarAcertos(selected.id);
    if (result.success) {
      await loadAcertos(selected.id);
      await loadImports();
    } else {
      alert("Erro: " + result.error);
    }
    setCalculating(false);
  }

  function handleExport() {
    if (!acertos.length || !selected) return;
    const rows = filtered.map((a) => ({
      Clube: a.club_name,
      "ID Externo": a.club_external_id,
      Modelo: LABELS[a.settlement_type] ?? a.settlement_type,
      "Rake MTT": a.rake_mtt,
      "Rake Cash": a.rake_cash,
      "Rake Spinup": a.rake_spinup,
      "Rake Total": a.rake_total,
      Ganhos: a.player_result,
      "Fee Calculado": feeDisplay(a),
      Rebate: a.rebate_calculado,
      "Valor Acerto": valorDisplay(a),
      Status: a.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Acertos");
const liga = (imports.find((i) => i.id === selected.id)?.leagues?.name ?? "sem_liga").replace(/\s+/g, "_");
const period = selected.period_start ? `_${selected.period_start}_${selected.period_end}` : "";
XLSX.writeFile(wb, `acertos_${liga}${period}.xlsx`);
  }

  const filtered = acertos.filter((a) => {
    const t = filterType === "todos" || a.settlement_type === filterType;
    const s = a.club_name.toLowerCase().includes(search.toLowerCase()) ||
              a.club_external_id.includes(search);
    return t && s;
  });

  const totais = filtered.reduce(
    (acc, a) => ({
      rake_total:    acc.rake_total    + a.rake_total,
      fee_calculado: acc.fee_calculado + feeDisplay(a),
      rebate:        acc.rebate        + a.rebate_calculado,
      valor_acerto:  acc.valor_acerto  + valorDisplay(a),
    }),
    { rake_total: 0, fee_calculado: 0, rebate: 0, valor_acerto: 0 }
  );

  const semRegra = acertos.filter((a) => a.status === "sem_regra").length;
  const tipos = [...new Set(acertos.map((a) => a.settlement_type))];

  return (
    <div style={{ fontFamily: "var(--font-sans), sans-serif", background: "#0C0E0B", minHeight: "100vh", color: "#F0EDE4", padding: "40px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        .card{background:#111410;border-radius:10px;border:1px solid #1e2018}
        .btn-gold{background:#C9A84C;color:#0C0E0B;border:none;border-radius:8px;padding:10px 20px;font-family:'DM Sans',sans-serif;font-weight:600;font-size:13px;cursor:pointer;transition:opacity .15s}
        .btn-gold:hover{opacity:.85}.btn-gold:disabled{opacity:.4;cursor:not-allowed}
        .btn-ghost{background:transparent;color:#C9A84C;border:1px solid #3D6E3D;border-radius:8px;padding:8px 16px;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer}
        .btn-ghost:hover,.btn-ghost.active{border-color:#C9A84C;background:#1a1e14}
        .imp{padding:12px 16px;border-bottom:1px solid #151710;cursor:pointer;transition:background .15s}
        .imp:hover{background:#161810}.imp.sel{background:#1a1e14;border-left:2px solid #C9A84C}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7a7a70;padding:8px 12px;border-bottom:1px solid #1e2018;white-space:nowrap}
        td{padding:10px 12px;font-size:13px;border-bottom:1px solid #151710;color:#d0cdc5}
        tr:last-child td{border-bottom:none}tr:hover td{background:#131610}
        .badge{border-radius:20px;padding:2px 10px;font-size:11px}
        .bok{background:#1c3a1c;color:#7DC97D}.bwarn{background:#3a2a0a;color:#C9A84C}.berr{background:#3a1c1c;color:#E07070}
        .stat{background:#111410;border:1px solid #1e2018;border-radius:10px;padding:16px 20px}
        input[type=text]{background:#111410;color:#F0EDE4;border:1px solid #2a2c20;border-radius:8px;padding:8px 12px;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;width:200px}
        input[type=text]:focus{border-color:#C9A84C}
        .vpos{color:#7DC97D}.vneg{color:#E07070}.vzero{color:#5a5a52}
      `}</style>

      <div style={{ marginBottom: 32 }}>
        <p style={{ color: "#C9A84C", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>PokerOS · Acertos</p>
        <h1 style={{ fontFamily: "var(--font-display), serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Resumo de Acertos</h1>
        <p style={{ color: "#6a6a62", fontSize: 14, marginTop: 6 }}>Selecione um import para calcular e conferir os acertos por clube</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, maxWidth: 1300 }}>

        {/* Lista imports */}
        <div className="card" style={{ overflow: "hidden", alignSelf: "start" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e2018" }}>
            <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a5a52", margin: 0 }}>Imports</p>
          </div>
          {imports.map((imp) => (
            <div key={imp.id} className={`imp${selected?.id === imp.id ? " sel" : ""}`} onClick={() => handleSelect(imp)}>
              <p style={{ color: "#C9A84C", fontSize: 13, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imp.file_name}</p>
              <p style={{ color: "#5a5a52", fontSize: 11, margin: "0 0 4px" }}>{imp.leagues?.name ?? "—"} · {imp.period_start ?? "s/período"}</p>
              <span className={`badge ${imp.status === "acertos_calculados" ? "bok" : imp.status === "parcial" ? "bwarn" : imp.status === "done" ? "bwarn" : "berr"}`}>
                {imp.status === "acertos_calculados" ? "✓ Calculado" : imp.status === "parcial" ? "⚠ Parcial" : imp.status === "done" ? "Aguardando" : imp.status}
              </span>
            </div>
          ))}
        </div>

        {/* Painel acertos */}
        <div>
          {!selected ? (
            <div className="card" style={{ padding: "64px 32px", textAlign: "center" }}>
              <p style={{ color: "#3a3a32", fontSize: 14 }}>← Selecione um import</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <p style={{ fontFamily: "var(--font-display), serif", fontSize: 18, margin: "0 0 2px" }}>{selected.file_name}</p>
                  <p style={{ color: "#5a5a52", fontSize: 12, margin: 0 }}>{selected.leagues?.name ?? "—"}{selected.period_start && ` · ${selected.period_start} → ${selected.period_end}`}</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn-gold" onClick={handleCalcular} disabled={calculating}>
                    {calculating ? "⏳ Calculando..." : acertos.length > 0 ? "↺ Recalcular" : "▶ Calcular Acertos"}
                  </button>
                  {acertos.length > 0 && <button className="btn-ghost" onClick={handleExport}>↓ Exportar xlsx</button>}
                </div>
              </div>

              {semRegra > 0 && (
                <div style={{ background: "#1a150a", border: "1px solid #5a3a0a", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                  <p style={{ color: "#C9A84C", fontSize: 13, margin: 0 }}>⚠ {semRegra} clube{semRegra > 1 ? "s" : ""} sem regra cadastrada — acerto zerado. Cadastre em Clubes.</p>
                </div>
              )}

              {acertos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Rake Total", value: totais.rake_total, color: "#F0EDE4" },
                    { label: "Fee Calculado", value: totais.fee_calculado, color: "#C9A84C" },
                    { label: "Rebate", value: totais.rebate, color: "#E07070" },
                    { label: "Valor Acerto", value: totais.valor_acerto, color: totais.valor_acerto >= 0 ? "#7DC97D" : "#E07070" },
                  ].map((s) => (
                    <div key={s.label} className="stat">
                      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#5a5a52", margin: "0 0 4px" }}>{s.label}</p>
                      <p style={{ fontSize: 20, fontWeight: 600, color: s.color, margin: 0 }}>{fmt(s.value)}</p>
                    </div>
                  ))}
                </div>
              )}

              {acertos.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <input type="text" placeholder="Buscar clube..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  <button className={`btn-ghost${filterType === "todos" ? " active" : ""}`} onClick={() => setFilterType("todos")}>Todos ({acertos.length})</button>
                  {tipos.map((t) => (
                    <button key={t} className={`btn-ghost${filterType === t ? " active" : ""}`} onClick={() => setFilterType(t)}>
                      {LABELS[t] ?? t} ({acertos.filter((a) => a.settlement_type === t).length})
                    </button>
                  ))}
                </div>
              )}

              {loading ? (
                <div className="card" style={{ padding: 24, textAlign: "center", color: "#5a5a52" }}>Carregando...</div>
              ) : acertos.length === 0 ? (
                <div className="card" style={{ padding: 32, textAlign: "center" }}>
                  <p style={{ color: "#5a5a52", fontSize: 13, marginBottom: 16 }}>Nenhum acerto calculado ainda</p>
                  <button className="btn-gold" onClick={handleCalcular} disabled={calculating}>{calculating ? "⏳ Calculando..." : "▶ Calcular Acertos"}</button>
                </div>
              ) : (
                <div className="card" style={{ overflow: "hidden" }}>
                  <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Clube</th><th>Modelo</th>
                          <th style={{ textAlign: "right" }}>Rake MTT</th>
                          <th style={{ textAlign: "right" }}>Rake Cash</th>
                          <th style={{ textAlign: "right" }}>Rake Total</th>
                          <th style={{ textAlign: "right" }}>Ganhos</th>
                          <th style={{ textAlign: "right" }}>Fee</th>
                          <th style={{ textAlign: "right" }}>Rebate</th>
                          <th style={{ textAlign: "right" }}>Valor Acerto</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <button
                                onClick={() => setCardAberto(a)}
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                                title="Ver acerto no formato tradicional"
                              >
                                <p style={{ color: "#C9A84C", margin: "0 0 1px", fontSize: 13, textDecoration: "underline", textDecorationColor: "transparent" }}
                                   onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "#C9A84C")}
                                   onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
                                >{a.club_name}</p>
                                <p style={{ color: "#3a3a32", margin: 0, fontSize: 11 }}>{a.club_external_id}</p>
                              </button>
                            </td>
                            <td><span style={{ fontSize: 11, color: "#7a7a70" }}>{LABELS[a.settlement_type] ?? a.settlement_type}</span></td>
                            <td style={{ textAlign: "right" }}>{fmt(a.rake_mtt)}</td>
                            <td style={{ textAlign: "right" }}>{fmt(a.rake_cash)}</td>
                            <td style={{ textAlign: "right" }}>{fmt(a.rake_total)}</td>
                            <td style={{ textAlign: "right", color: a.player_result >= 0 ? "#7DC97D" : "#E07070" }}>{fmt(a.player_result)}</td>
                            <td style={{ textAlign: "right", color: "#C9A84C" }}>{fmt(feeDisplay(a))}</td>
                            <td style={{ textAlign: "right", color: "#E07070" }}>{a.rebate_calculado > 0 ? fmt(a.rebate_calculado) : "—"}</td>
                            <td style={{ textAlign: "right" }}>
                              <strong className={valorDisplay(a) > 0 ? "vpos" : valorDisplay(a) < 0 ? "vneg" : "vzero"}>{fmt(valorDisplay(a))}</strong>
                            </td>
                            <td><span className={`badge ${a.status === "calculado" ? "bok" : a.status === "sem_regra" ? "berr" : "bwarn"}`}>{a.status === "calculado" ? "✓" : a.status === "sem_regra" ? "Sem regra" : a.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "12px 16px", borderTop: "1px solid #1e2018", display: "flex", justifyContent: "flex-end", gap: 32 }}>
                    <span style={{ fontSize: 12, color: "#5a5a52" }}>Rake: <strong style={{ color: "#F0EDE4" }}>{fmt(totais.rake_total)}</strong></span>
                    <span style={{ fontSize: 12, color: "#5a5a52" }}>Fee: <strong style={{ color: "#C9A84C" }}>{fmt(totais.fee_calculado)}</strong></span>
                    <span style={{ fontSize: 12, color: "#5a5a52" }}>Acerto total: <strong style={{ color: totais.valor_acerto >= 0 ? "#7DC97D" : "#E07070", fontSize: 14 }}>{fmt(totais.valor_acerto)}</strong></span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {cardAberto && selected && (
        <ClubAcertoCard
          acerto={cardAberto}
          ligaNome={selected.leagues?.name ?? "—"}
          periodStart={selected.period_start}
          periodEnd={selected.period_end}
          onClose={() => setCardAberto(null)}
          onSaved={() => loadAcertos(selected.id)}
        />
      )}
    </div>
  );
}
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type Plataforma = { id: string; nome: string; moeda: string };

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

interface ParsedFile {
  plataforma: "PPPoker" | "GGPoker" | "unknown";
  liga_nome?: string;
  liga_id_ext?: string;
  period_start: string;
  period_end: string;
  rows: ImportRow[];
  warnings: string[];
}

interface ImportRecord {
  id: string;
  file_name: string;
  app_source: string;
  period_start: string;
  period_end: string;
  status: string;
  error_message: string | null;
  created_at: string;
  league_id: string | null;
  plataforma_id: string | null;
  leagues?: { name: string } | null;
  plataformas?: { nome: string } | null;
}

type UploadStep = "idle" | "parsing" | "parsed" | "confirm_platform" | "saving" | "done" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePeriodFromFileName(name: string): { start: string; end: string } {
  const match = name.match(/(\d{8})-(\d{8})/);
  if (!match) return { start: "", end: "" };
  const fmt = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return { start: fmt(match[1]), end: fmt(match[2]) };
}

function parsePeriodFromGG(raw: unknown[][]): { start: string; end: string } {
  for (let i = 0; i < 6; i++) {
    const row = raw[i] as unknown[];
    for (const cell of row) {
      const s = String(cell ?? "");
      const m = s.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
      if (m) return { start: m[1], end: m[2] };
    }
  }
  return { start: "", end: "" };
}

function safeNum(v: unknown): number {
  const n = parseFloat(String(v ?? "0").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function detectPlataforma(wb: XLSX.WorkBook): "PPPoker" | "GGPoker" | "unknown" {
  if (wb.SheetNames.includes("Union Overview")) return "GGPoker";
  if (wb.SheetNames.includes("Geral da liga") || wb.SheetNames.includes("Geral")) return "PPPoker";
  return "unknown";
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parsePPPoker(wb: XLSX.WorkBook, fileName: string): Omit<ParsedFile, "plataforma"> {
  const period = parsePeriodFromFileName(fileName);
  const warnings: string[] = [];
  const rows: ImportRow[] = [];

  const sheetName = wb.SheetNames.find(s => s === "Geral da liga" || s === "Geral")!;
  const isLiga = sheetName === "Geral da liga";
  const ws = wb.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  let liga_nome: string | undefined;
  let liga_id_ext: string | undefined;

  if (isLiga) {
    // Linha 2 tem o período e nome da liga no header
    for (let i = 4; i < raw.length; i++) {
      const row = raw[i] as unknown[];
      const clubName = String(row[1] ?? "").trim();
      const clubId = String(row[2] ?? "").trim();
      if (!clubName || clubName === "Total" || clubId === "") continue;

      const rawEntry: Record<string, unknown> = {};
      (raw[3] as unknown[])?.forEach((header, idx) => {
        if (header) rawEntry[String(header)] = row[idx];
      });

      rows.push({
        club_name: clubName,
        club_external_id: clubId,
        player_result: safeNum(row[8]),
        rake_total: safeNum(row[23]),
        rake_mtt: safeNum(row[24]),
        rake_cash: safeNum(row[25]),
        rake_spinup: safeNum(row[30]),
        fee_total: 0,
        agente_nome: "",
        agente_id_ext: "",
        superagente_nome: "",
        superagente_id_ext: "",
        raw_data: rawEntry,
      });
    }
  } else {
    // Arquivo de clube direto
    const clubHeader = String((raw[1] as unknown[])?.[0] ?? "");
    const clubMatch = clubHeader.match(/^(.*?)\s*\((\d+)\)/);
    const clubName = clubMatch ? clubMatch[1].trim() : fileName.replace(".xlsx", "");
    const clubId = clubMatch ? clubMatch[2] : "";
    liga_nome = clubName;
    liga_id_ext = clubId;

    let totalPlayerResult = 0;
    let totalRake = 0;

    for (let i = 3; i < raw.length; i++) {
      const row = raw[i] as unknown[];
      const playerId = String(row[1] ?? "").trim();
      if (!playerId || playerId === "Total") continue;
      totalPlayerResult += safeNum(row[8]);
      totalRake += safeNum(row[28]);
    }

    if (clubName) {
      rows.push({
        club_name: clubName,
        club_external_id: clubId,
        player_result: totalPlayerResult,
        rake_total: totalRake,
        rake_mtt: 0,
        rake_cash: 0,
        rake_spinup: 0,
        fee_total: 0,
        agente_nome: "",
        agente_id_ext: "",
        superagente_nome: "",
        superagente_id_ext: "",
        raw_data: { source: "clube_direto", file: fileName },
      });
    }
  }

  if (rows.length === 0) warnings.push("Nenhuma linha de dados encontrada.");
  return { liga_nome, liga_id_ext, period_start: period.start, period_end: period.end, rows, warnings };
}

function parseGGPoker(wb: XLSX.WorkBook): Omit<ParsedFile, "plataforma"> {
  const warnings: string[] = [];
  const rows: ImportRow[] = [];
  const ws = wb.Sheets["Union Overview"];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const period = parsePeriodFromGG(raw);

  // Detectar linha de header (tem "Club" e "Total Fee")
  let headerRow = -1;
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const joined = row.map(c => String(c)).join("|");
    if (joined.includes("Total Fee") || joined.includes("Club Name")) {
      headerRow = i;
      break;
    }
  }

  // Liga (Union) nome e ID
  let liga_nome: string | undefined;
  let liga_id_ext: string | undefined;
  for (let i = 0; i < 4; i++) {
    const row = raw[i] as unknown[];
    for (const cell of row) {
      const s = String(cell ?? "");
      if (s.startsWith("Union Name")) liga_nome = s.replace("Union Name :", "").replace("Union Name:", "").trim();
      if (s.startsWith("Union ID")) liga_id_ext = s.replace("Union ID :", "").replace("Union ID:", "").trim();
    }
  }

  if (headerRow === -1) {
    warnings.push("Header do GGPoker não encontrado.");
    return { liga_nome, liga_id_ext, period_start: period.start, period_end: period.end, rows, warnings };
  }

  const headers = (raw[headerRow] as unknown[]).map(h => String(h ?? "").trim());
  const idxClubId = headers.findIndex(h => h === "ID" || h === "Club ID");
  const idxClubName = headers.findIndex(h => h.toLowerCase().includes("club name") || h === "Club");
  const idxFee = headers.findIndex(h => h === "Total Fee");
  const idxPL = headers.findIndex(h => h === "P&L");

  for (let i = headerRow + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const clubId = String(row[idxClubId] ?? "").trim();
    const clubName = String(row[idxClubName] ?? "").trim();
    if (!clubId || clubName === "TOTAL" || clubName === "") continue;

    rows.push({
      club_name: clubName,
      club_external_id: clubId,
      rake_total: 0,
      rake_mtt: 0,
      rake_cash: 0,
      rake_spinup: 0,
      fee_total: safeNum(row[idxFee]),
      player_result: safeNum(row[idxPL]),
      agente_nome: "",
      agente_id_ext: "",
      superagente_nome: "",
      superagente_id_ext: "",
      raw_data: { source: "ggpoker", row: Object.fromEntries(headers.map((h, idx) => [h, row[idx]])) },
    });
  }

  if (rows.length === 0) warnings.push("Nenhuma linha de dados encontrada.");
  return { liga_nome, liga_id_ext, period_start: period.start, period_end: period.end, rows, warnings };
}

function parseXlsx(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const plataforma = detectPlataforma(wb);

        if (plataforma === "PPPoker") {
          resolve({ plataforma, ...parsePPPoker(wb, file.name) });
        } else if (plataforma === "GGPoker") {
          resolve({ plataforma, ...parseGGPoker(wb) });
        } else {
          resolve({ plataforma: "unknown", period_start: "", period_end: "", rows: [], warnings: ["Plataforma não reconhecida."] });
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ImportacaoXlsx() {
  const [plataformas, setPlataformas] = useState<Plataforma[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [step, setStep] = useState<UploadStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Para fluxo de plataforma desconhecida
  const [platformAction, setPlatformAction] = useState<"new" | "existing" | null>(null);
  const [newPlatformName, setNewPlatformName] = useState("");
  const [selectedExistingPlatform, setSelectedExistingPlatform] = useState("");
  const [resolvedPlatformId, setResolvedPlatformId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPlataformas();
    loadHistory();
  }, []);

  async function loadPlataformas() {
    const { data } = await supabase.from("plataformas").select("id, nome, moeda").order("nome");
    if (data) setPlataformas(data);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("imports")
      .select("*, leagues(name), plataformas(nome)")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data as ImportRecord[]);
    setLoadingHistory(false);
  }

  const handleFile = useCallback(async (f: File) => {
    if (!f.name.endsWith(".xlsx")) {
      setErrorMsg("Apenas arquivos .xlsx são aceitos.");
      setStep("error");
      return;
    }
    setFile(f);
    setStep("parsing");
    setErrorMsg("");
    setParsed(null);
    setResolvedPlatformId(null);
    setPlatformAction(null);
    setNewPlatformName("");
    setSelectedExistingPlatform("");

    try {
      const result = await parseXlsx(f);
      setParsed(result);

      if (result.plataforma === "unknown") {
        setStep("confirm_platform");
      } else {
        // Busca plataforma existente pelo nome
        const match = plataformas.find(p => p.nome.toLowerCase() === result.plataforma.toLowerCase());
        if (match) {
          setResolvedPlatformId(match.id);
          setStep("parsed");
        } else {
          // Plataforma reconhecida pelo arquivo mas não cadastrada ainda
          setNewPlatformName(result.plataforma);
          setStep("confirm_platform");
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao processar arquivo.");
      setStep("error");
    }
  }, [plataformas]);

  async function handleResolvePlatform() {
    if (platformAction === "new") {
      if (!newPlatformName.trim()) return;
      const { data, error } = await supabase
        .from("plataformas")
        .insert({ nome: newPlatformName.trim(), moeda: "USD" })
        .select()
        .single();
      if (error) { setErrorMsg(error.message); setStep("error"); return; }
      setResolvedPlatformId(data.id);
      await loadPlataformas();
    } else {
      if (!selectedExistingPlatform) return;
      setResolvedPlatformId(selectedExistingPlatform);
    }
    setStep("parsed");
  }

  async function handleConfirmImport() {
    if (!file || !parsed || !resolvedPlatformId) return;
    setStep("saving");
    try {
      // Busca ou cria a liga pelo nome/id externo
      let leagueId: string | null = null;
      if (parsed.liga_id_ext) {
        const { data: existing } = await supabase
          .from("leagues")
          .select("id")
          .eq("external_id", parsed.liga_id_ext)
          .maybeSingle();
        leagueId = existing?.id ?? null;
      }

      const { data: importData, error: importError } = await supabase
        .from("imports")
        .insert({
          league_id: leagueId,
          plataforma_id: resolvedPlatformId,
          file_name: file.name,
          app_source: parsed.plataforma,
          period_start: parsed.period_start || null,
          period_end: parsed.period_end || null,
          status: "processing",
          uploaded_by: "admin",
        })
        .select()
        .single();

      if (importError) throw new Error(importError.message);

      const { error: rowsError } = await supabase
        .from("import_rows")
        .insert(
          parsed.rows.map((row) => ({
            import_id: importData.id,
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

      if (rowsError) throw new Error(rowsError.message);

      await supabase.from("imports").update({ status: "done" }).eq("id", importData.id);

      setStep("done");
      setParsed(null);
      setFile(null);
      setResolvedPlatformId(null);
      await loadHistory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao salvar.");
      setStep("error");
    }
  }

  function reset() {
    setStep("idle");
    setFile(null);
    setParsed(null);
    setErrorMsg("");
    setResolvedPlatformId(null);
    setPlatformAction(null);
    setNewPlatformName("");
    setSelectedExistingPlatform("");
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0C0E0B", minHeight: "100vh", color: "#F0EDE4", padding: "40px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');
        .drop-zone{border:1.5px dashed #3D6E3D;border-radius:12px;padding:48px 32px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;background:#111410}
        .drop-zone:hover,.drop-zone.drag-over{border-color:#C9A84C;background:#16180f}
        .btn-gold{background:#C9A84C;color:#0C0E0B;border:none;border-radius:8px;padding:10px 24px;font-family:'DM Sans',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:opacity .15s}
        .btn-gold:hover{opacity:.85}
        .btn-gold:disabled{opacity:.4;cursor:not-allowed}
        .btn-ghost{background:transparent;color:#C9A84C;border:1px solid #3D6E3D;border-radius:8px;padding:8px 20px;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;transition:border-color .15s}
        .btn-ghost:hover{border-color:#C9A84C}
        .select-field{background:#111410;color:#F0EDE4;border:1px solid #3D6E3D;border-radius:8px;padding:10px 14px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;cursor:pointer;outline:none}
        .select-field:focus{border-color:#C9A84C}
        .input-field{background:#111410;color:#F0EDE4;border:1px solid #3D6E3D;border-radius:8px;padding:10px 14px;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;box-sizing:border-box}
        .input-field:focus{border-color:#C9A84C}
        .card{background:#111410;border-radius:10px;border:1px solid #1e2018}
        .badge{border-radius:20px;padding:2px 10px;font-size:12px}
        .badge-ok{background:#1c3a1c;color:#7DC97D}
        .badge-error{background:#3a1c1c;color:#E07070}
        .badge-processing{background:#2a2a1c;color:#C9A84C}
        .badge-reprocessing{background:#1c2a3a;color:#7DC9C9}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7a7a70;padding:8px 12px;border-bottom:1px solid #1e2018}
        td{padding:10px 12px;font-size:13px;border-bottom:1px solid #151710;color:#d0cdc5}
        tr:last-child td{border-bottom:none}
        .label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#5a5a52;margin-bottom:6px}
        .radio-opt{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #2a2a22;border-radius:8px;cursor:pointer;transition:border-color .15s}
        .radio-opt:hover{border-color:#C9A84C}
        .radio-opt.selected{border-color:#C9A84C;background:#1a1a10}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: "#C9A84C", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>PokerOS · Importação</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Importar Arquivo .xlsx</h1>
        <p style={{ color: "#6a6a62", fontSize: 14, marginTop: 6 }}>PPPoker · GGPoker · Detecção automática de plataforma</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 1100 }}>

        {/* Esquerda */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Drop zone */}
          <div
            className={`drop-zone${dragOver ? " drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".xlsx" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            <div style={{ fontSize: 28, marginBottom: 10, color: "#C9A84C" }}>♦</div>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: "#C9A84C", marginBottom: 4 }}>Arraste ou clique para selecionar</p>
            <p style={{ fontSize: 12, color: "#5a5a52" }}>Apenas arquivos .xlsx</p>
          </div>

          {/* Status: parsing */}
          {step === "parsing" && (
            <div className="card" style={{ padding: 14 }}>
              <span style={{ color: "#C9A84C", fontSize: 13 }}>⏳ Analisando arquivo...</span>
            </div>
          )}

          {/* Status: confirm_platform */}
          {step === "confirm_platform" && parsed && (
            <div className="card" style={{ padding: 20 }}>
              <p style={{ color: "#C9A84C", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                {parsed.plataforma === "unknown"
                  ? "⚠ Plataforma não reconhecida"
                  : `⚠ Plataforma detectada: ${parsed.plataforma}`}
              </p>
              <p style={{ color: "#7a7a70", fontSize: 12, marginBottom: 16 }}>
                {parsed.plataforma === "unknown"
                  ? "Não conseguimos identificar a plataforma deste arquivo. Como deseja prosseguir?"
                  : `"${parsed.plataforma}" ainda não está cadastrada. Como deseja prosseguir?`}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                <div
                  className={`radio-opt${platformAction === "new" ? " selected" : ""}`}
                  onClick={() => setPlatformAction("new")}
                >
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${platformAction === "new" ? "#C9A84C" : "#3D6E3D"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {platformAction === "new" && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A84C" }} />}
                  </div>
                  <span style={{ fontSize: 13 }}>É uma nova plataforma</span>
                </div>
                <div
                  className={`radio-opt${platformAction === "existing" ? " selected" : ""}`}
                  onClick={() => setPlatformAction("existing")}
                >
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${platformAction === "existing" ? "#C9A84C" : "#3D6E3D"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {platformAction === "existing" && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9A84C" }} />}
                  </div>
                  <span style={{ fontSize: 13 }}>É uma plataforma existente</span>
                </div>
              </div>

              {platformAction === "new" && (
                <div style={{ marginBottom: 16 }}>
                  <p className="label">Nome da nova plataforma</p>
                  <input
                    className="input-field"
                    value={newPlatformName}
                    onChange={e => setNewPlatformName(e.target.value)}
                    placeholder="Ex: PokerBros"
                  />
                </div>
              )}

              {platformAction === "existing" && (
                <div style={{ marginBottom: 16 }}>
                  <p className="label">Selecione a plataforma</p>
                  <select className="select-field" value={selectedExistingPlatform} onChange={e => setSelectedExistingPlatform(e.target.value)}>
                    <option value="">Selecione...</option>
                    {plataformas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn-gold"
                  disabled={!platformAction || (platformAction === "new" && !newPlatformName.trim()) || (platformAction === "existing" && !selectedExistingPlatform)}
                  onClick={handleResolvePlatform}
                >
                  Continuar
                </button>
                <button className="btn-ghost" onClick={reset}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Status: parsed */}
          {step === "parsed" && parsed && file && (
            <div className="card" style={{ padding: 16, borderColor: "#2a5a2a" }}>
              <p style={{ color: "#7DC97D", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>✓ Arquivo válido</p>
              <p style={{ color: "#5a5a52", fontSize: 12, marginBottom: 2 }}>{file.name}</p>
              <p style={{ color: "#5a5a52", fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: "#C9A84C" }}>{parsed.plataforma}</span>
                {parsed.liga_nome && <> · {parsed.liga_nome}</>}
              </p>
              <p style={{ color: "#5a5a52", fontSize: 12, marginBottom: 4 }}>
                {parsed.rows.length} clube{parsed.rows.length !== 1 ? "s" : ""} detectado{parsed.rows.length !== 1 ? "s" : ""}
                {parsed.period_start && ` · ${parsed.period_start} → ${parsed.period_end}`}
              </p>
              {parsed.warnings.map((w, i) => <p key={i} style={{ color: "#C9A84C", fontSize: 12, marginBottom: 4 }}>⚠ {w}</p>)}
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className="btn-gold" onClick={handleConfirmImport}>Confirmar importação</button>
                <button className="btn-ghost" onClick={reset}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Status: saving */}
          {step === "saving" && (
            <div className="card" style={{ padding: 14 }}>
              <span style={{ color: "#C9A84C", fontSize: 13 }}>⏳ Salvando no banco...</span>
            </div>
          )}

          {/* Status: done */}
          {step === "done" && (
            <div className="card" style={{ padding: 14, borderColor: "#2a5a2a" }}>
              <p style={{ color: "#7DC97D", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>✓ Importação concluída</p>
              <p style={{ color: "#5a5a52", fontSize: 12 }}>Dados salvos com sucesso.</p>
            </div>
          )}

          {/* Status: error */}
          {step === "error" && (
            <div className="card" style={{ padding: 16, borderColor: "#5a2020" }}>
              <p style={{ color: "#E07070", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>✗ Erro</p>
              <p style={{ color: "#c08080", fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>
              <button className="btn-ghost" onClick={reset}>Tentar novamente</button>
            </div>
          )}
        </div>

        {/* Direita: preview */}
        <div>
          {parsed && parsed.rows.length > 0 ? (
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e2018", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a5a52", margin: 0 }}>
                  Preview · {parsed.rows.length} linhas
                </p>
                <span style={{ fontSize: 11, color: "#3D6E3D" }}>{parsed.plataforma}</span>
              </div>
              <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Clube</th>
                      <th>ID Externo</th>
                      <th>{parsed.plataforma === "GGPoker" ? "Fee Total" : "Rake Total"}</th>
                      <th>Result. Jogador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        <td style={{ color: "#C9A84C" }}>{row.club_name}</td>
                        <td style={{ color: "#5a5a52" }}>{row.club_external_id}</td>
                        <td>{(parsed.plataforma === "GGPoker" ? row.fee_total : row.rake_total).toFixed(2)}</td>
                        <td style={{ color: row.player_result >= 0 ? "#7DC97D" : "#E07070" }}>
                          {row.player_result.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {parsed.rows.length > 20 && (
                      <tr><td colSpan={4} style={{ color: "#5a5a52", textAlign: "center" }}>+ {parsed.rows.length - 20} linhas não exibidas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: "48px 32px", textAlign: "center" }}>
              <p style={{ color: "#3a3a32", fontSize: 13 }}>Preview aparece após upload</p>
            </div>
          )}
        </div>
      </div>

      {/* Histórico */}
      <div style={{ maxWidth: 1100, marginTop: 36 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, margin: 0 }}>Histórico de importações</h2>
          <span style={{ fontSize: 12, color: "#5a5a52" }}>{history.length} registros</span>
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          {loadingHistory ? (
            <div style={{ padding: 24, textAlign: "center", color: "#5a5a52", fontSize: 13 }}>Carregando...</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#3a3a32", fontSize: 13 }}>Nenhuma importação ainda</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Plataforma</th>
                  <th>Período</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ color: "#C9A84C", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.file_name}</td>
                    <td style={{ color: "#7a7a70" }}>{entry.plataformas?.nome ?? entry.app_source ?? "—"}</td>
                    <td style={{ color: "#7a7a70", fontSize: 12 }}>{entry.period_start ? `${entry.period_start} → ${entry.period_end}` : "—"}</td>
                    <td>
                      <span className={`badge ${entry.status === "done" ? "badge-ok" : entry.status === "error" ? "badge-error" : entry.status === "reprocessing" ? "badge-reprocessing" : "badge-processing"}`}>
                        {entry.status === "done" ? "✓ OK" : entry.status === "error" ? "✗ Erro" : "⏳ " + entry.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "#7a7a70" }}>{new Date(entry.created_at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
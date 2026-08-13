"use client";
import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { X, Loader2 } from "lucide-react";
import type { MapeamentoColunas } from "./ImportacaoXlsx";

interface Props {
  open: boolean;
  file: File | null;
  plataformaNome: string;
  onCancel: () => void;
  onSave: (mapeamento: MapeamentoColunas) => Promise<void>;
}

const CAMPOS_VAZIOS: MapeamentoColunas["campos"] = {
  club_name: "", club_external_id: "", player_result: "",
  rake_mtt: "", rake_cash: "", rake_total: "", rake_spinup: "",
};

const CAMPOS: { key: keyof MapeamentoColunas["campos"]; label: string; obrigatorio?: boolean }[] = [
  { key: "club_name", label: "Nome do Clube", obrigatorio: true },
  { key: "club_external_id", label: "ID do Clube (na plataforma)" },
  { key: "player_result", label: "Ganhos do Jogador" },
  { key: "rake_mtt", label: "Rake MTT" },
  { key: "rake_cash", label: "Rake Cash" },
  { key: "rake_total", label: "Rake Total (se não tiver MTT/Cash separado)" },
  { key: "rake_spinup", label: "Rake SpinUp" },
];

// Popup pra ensinar o sistema a ler uma plataforma nova (ex: ClubGG) sem
// precisar de código novo — configura uma vez qual coluna é o quê, e o
// mapeamento fica salvo na plataforma pra toda importação futura.
export function MapeamentoColunasModal({ open, file, plataformaNome, onCancel, onSave }: Props) {
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState("");
  const [headerRow, setHeaderRow] = useState(1);
  const [campos, setCampos] = useState<MapeamentoColunas["campos"]>(CAMPOS_VAZIOS);

  useEffect(() => {
    if (!open || !file) return;
    setLoading(true); setError(null); setWb(null); setCampos(CAMPOS_VAZIOS);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        setWb(workbook);
        // Sugestão inicial: a aba com mais linhas costuma ser a de dados.
        let melhor = workbook.SheetNames[0] ?? "";
        let maisLinhas = 0;
        for (const nome of workbook.SheetNames) {
          const linhas: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[nome], { header: 1 });
          if (linhas.length > maisLinhas) { maisLinhas = linhas.length; melhor = nome; }
        }
        setSheet(melhor);
        setHeaderRow(1);
      } catch {
        setError("Não foi possível ler o arquivo.");
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => { setError("Não foi possível ler o arquivo."); setLoading(false); };
    reader.readAsArrayBuffer(file);
  }, [open, file]);

  const linhasAba = useMemo(() => {
    if (!wb || !sheet) return [] as unknown[][];
    return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" }) as unknown[][];
  }, [wb, sheet]);

  const headers = useMemo(() => {
    const row = (linhasAba[headerRow - 1] as unknown[]) ?? [];
    return row.map(h => String(h ?? "").trim()).filter(Boolean);
  }, [linhasAba, headerRow]);

  const preview = useMemo(() => linhasAba.slice(headerRow, headerRow + 2), [linhasAba, headerRow]);

  if (!open) return null;

  const podeSalvar = !!campos.club_name && headers.length > 0;

  async function handleSave() {
    setSaving(true);
    try { await onSave({ sheet, headerRow, campos }); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Mapear colunas — {plataformaNome}</h2>
            <p className="text-xs text-gray-500">Configura uma vez; toda importação futura dessa plataforma reaproveita sozinha.</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm text-gray-500">Lendo arquivo...</p>
          ) : error ? (
            <p className="text-sm text-alert">{error}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Aba da planilha</label>
                  <select value={sheet} onChange={e => setSheet(e.target.value)} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50">
                    {wb?.SheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Linha com os títulos das colunas</label>
                  <input
                    type="number" min={1} value={headerRow}
                    onChange={e => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50"
                  />
                </div>
              </div>

              {headers.length === 0 ? (
                <p className="text-xs text-alert">Nenhuma coluna encontrada nessa linha — ajusta o número da linha acima até aparecer.</p>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Prévia (confirma se a linha certa foi escolhida)</p>
                    <div className="rounded-lg border border-white/10 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-surface2">{headers.map(h => <th key={h} className="px-2 py-1.5 text-left text-gray-400 whitespace-nowrap">{h}</th>)}</tr></thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr key={i} className="border-t border-white/5">
                              {headers.map((_, idx) => <td key={idx} className="px-2 py-1.5 text-gray-300 whitespace-nowrap">{String((row as unknown[])[idx] ?? "")}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-2">Qual coluna é qual</p>
                    <div className="grid grid-cols-2 gap-3">
                      {CAMPOS.map(({ key, label, obrigatorio }) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-500 mb-1.5">{label}{obrigatorio && <span className="text-alert"> *</span>}</label>
                          <select
                            value={campos[key]}
                            onChange={e => setCampos(c => ({ ...c, [key]: e.target.value }))}
                            className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50"
                          >
                            <option value="">— não tem —</option>
                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onCancel} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!podeSalvar || saving}
            className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}Salvar e importar
          </button>
        </div>
      </div>
    </div>
  );
}

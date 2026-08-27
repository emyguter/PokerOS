"use client";
import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { X, Loader2 } from "lucide-react";
import type { MapeamentoColunas } from "./ImportacaoXlsx";
import { useI18n } from "@/lib/i18n";

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

// Popup pra ensinar o sistema a ler uma plataforma nova (ex: ClubGG) sem
// precisar de código novo — configura uma vez qual coluna é o quê, e o
// mapeamento fica salvo na plataforma pra toda importação futura.
export function MapeamentoColunasModal({ open, file, plataformaNome, onCancel, onSave }: Props) {
  const { t } = useI18n();
  const CAMPOS: { key: keyof MapeamentoColunas["campos"]; label: string; obrigatorio?: boolean }[] = [
    { key: "club_name", label: t("mapeamento_colunas_modal.campo_club_name"), obrigatorio: true },
    { key: "club_external_id", label: t("mapeamento_colunas_modal.campo_club_external_id") },
    { key: "player_result", label: t("mapeamento_colunas_modal.campo_player_result") },
    { key: "rake_mtt", label: t("mapeamento_colunas_modal.campo_rake_mtt") },
    { key: "rake_cash", label: t("mapeamento_colunas_modal.campo_rake_cash") },
    { key: "rake_total", label: t("mapeamento_colunas_modal.campo_rake_total") },
    { key: "rake_spinup", label: t("mapeamento_colunas_modal.campo_rake_spinup") },
  ];
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
        setError(t("mapeamento_colunas_modal.erro_ler_arquivo"));
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => { setError(t("mapeamento_colunas_modal.erro_ler_arquivo")); setLoading(false); };
    reader.readAsArrayBuffer(file);
  }, [open, file, t]);

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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">{t("mapeamento_colunas_modal.titulo", { plataforma: plataformaNome })}</h2>
            <p className="text-xs text-gray-500">{t("mapeamento_colunas_modal.desc")}</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm text-gray-500">{t("mapeamento_colunas_modal.lendo_arquivo")}</p>
          ) : error ? (
            <p className="text-sm text-alert">{error}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t("mapeamento_colunas_modal.aba_planilha_label")}</label>
                  <select value={sheet} onChange={e => setSheet(e.target.value)} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50">
                    {wb?.SheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">{t("mapeamento_colunas_modal.linha_titulos_label")}</label>
                  <input
                    type="number" min={1} value={headerRow}
                    onChange={e => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50"
                  />
                </div>
              </div>

              {headers.length === 0 ? (
                <p className="text-xs text-alert">{t("mapeamento_colunas_modal.nenhuma_coluna_desc")}</p>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">{t("mapeamento_colunas_modal.previa_desc")}</p>
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
                    <p className="text-xs text-gray-500 mb-2">{t("mapeamento_colunas_modal.qual_coluna_desc")}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {CAMPOS.map(({ key, label, obrigatorio }) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-500 mb-1.5">{label}{obrigatorio && <span className="text-alert"> *</span>}</label>
                          <select
                            value={campos[key]}
                            onChange={e => setCampos(c => ({ ...c, [key]: e.target.value }))}
                            className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50"
                          >
                            <option value="">{t("mapeamento_colunas_modal.nao_tem")}</option>
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
          <button onClick={onCancel} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">{t("common.cancelar")}</button>
          <button
            onClick={handleSave}
            disabled={!podeSalvar || saving}
            className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}{t("mapeamento_colunas_modal.salvar_e_importar")}
          </button>
        </div>
      </div>
    </div>
  );
}

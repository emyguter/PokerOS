'use client'
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { buscarImportsComAcerto, type ImportResumo } from '@/lib/pagamentos'
import { buscarTop3RakeDoImport, marcarConferido, valoresBatem, type AcertoConferencia } from '@/lib/conferencia'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatImportLabel(i: ImportResumo) {
  return i.period_start ? `${i.period_start} → ${i.period_end || i.period_start}` : i.file_name
}

interface ValoresVistos { rake: string; ganhos: string }
const VAZIO: ValoresVistos = { rake: '', ganhos: '' }

function toNumero(v: string): number | null {
  if (!v.trim()) return null
  const n = Number(v.replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

// Conferência manual: o Suporte digita o que vê direto no app da
// plataforma pra Rake/Ganhos/Bilhetes de cada um dos clubes de maior rake
// desse import, e a tela compara na hora com o que foi calculado — não
// libera nada sozinho, é só o checklist visual de bateu/não bateu.
function LinhaConferencia({ label, calculado, visto, onChange }: { label: string; calculado: number; visto: string; onChange: (v: string) => void }) {
  const num = toNumero(visto)
  const bate = num != null ? valoresBatem(num, calculado) : null
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3">
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-white font-medium">{fmt(calculado)}</p>
      </div>
      <span className="text-gray-600 text-xs">vs</span>
      <input
        type="text"
        inputMode="decimal"
        value={visto}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Visto no app"
        className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
      />
      <div className="w-5">
        {bate === true && <CheckCircle2 size={18} className="text-success" />}
        {bate === false && <XCircle size={18} className="text-alert" />}
      </div>
    </div>
  )
}

export function ConferenciaAppView() {
  const { t } = useI18n()
  const [imports, setImports] = useState<ImportResumo[]>([])
  const [importId, setImportId] = useState('')
  const [clubes, setClubes] = useState<AcertoConferencia[]>([])
  const [loading, setLoading] = useState(false)
  const [vistos, setVistos] = useState<Record<string, ValoresVistos>>({})
  const [liberando, setLiberando] = useState(false)

  useEffect(() => {
    buscarImportsComAcerto().then((lista) => {
      setImports(lista)
      if (lista[0]) setImportId(lista[0].id)
    })
  }, [])

  const load = useCallback(async (id: string) => {
    if (!id) { setClubes([]); return }
    setLoading(true)
    setClubes(await buscarTop3RakeDoImport(id))
    setVistos({})
    setLoading(false)
  }, [])

  useEffect(() => { load(importId) }, [importId, load])

  function setValor(clubeKey: string, campo: keyof ValoresVistos, valor: string) {
    setVistos((prev) => ({ ...prev, [clubeKey]: { ...(prev[clubeKey] ?? VAZIO), [campo]: valor } }))
  }

  // Só libera quando os 3 clubes tiverem Rake E Ganhos batendo com o que o
  // Suporte digitou (pedido do Cássio) — nenhum valor em branco conta como
  // "bateu".
  const todosBatem = clubes.length > 0 && clubes.every((c) => {
    const key = c.club_id ?? c.club_external_id
    const visto = vistos[key] ?? VAZIO
    const rakeNum = toNumero(visto.rake)
    const ganhosNum = toNumero(visto.ganhos)
    return rakeNum != null && ganhosNum != null && valoresBatem(rakeNum, c.rake_total) && valoresBatem(ganhosNum, c.player_result)
  })

  const importAtual = imports.find((i) => i.id === importId)

  async function handleLiberar() {
    setLiberando(true)
    try {
      const agora = await marcarConferido(importId)
      setImports((prev) => prev.map((i) => (i.id === importId ? { ...i, conferido_em: agora } : i)))
    } finally {
      setLiberando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('conferencia.titulo')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('conferencia.subtitulo')}</p>
      </div>

      <div className="max-w-md">
        <label className="block text-xs text-gray-500 mb-1.5">{t('pagamentos.import')}</label>
        <select value={importId} onChange={(e) => setImportId(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
          {imports.length === 0 && <option value="">{t('pagamentos.nenhum_import')}</option>}
          {imports.map((i) => <option key={i.id} value={i.id}>{formatImportLabel(i)}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.carregando')}</p>
      ) : clubes.length === 0 ? (
        <p className="text-sm text-gray-500 italic">{t('conferencia.nenhum_clube')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {clubes.map((c) => {
            const key = c.club_id ?? c.club_external_id
            const visto = vistos[key] ?? VAZIO
            return (
              <div key={key} className="rounded-xl border border-white/10 bg-surface2 p-4 space-y-4">
                <div>
                  <p className="text-white font-medium">{c.club_name}</p>
                  <p className="text-xs text-gray-500">{c.club_external_id}</p>
                </div>
                <LinhaConferencia label={t('conferencia.rake')} calculado={c.rake_total} visto={visto.rake} onChange={(v) => setValor(key, 'rake', v)} />
                <LinhaConferencia label={t('conferencia.ganhos')} calculado={c.player_result} visto={visto.ganhos} onChange={(v) => setValor(key, 'ganhos', v)} />
              </div>
            )
          })}
        </div>
      )}

      {!loading && clubes.length > 0 && (
        importAtual?.conferido_em ? (
          <p className="flex items-center gap-1.5 text-sm text-success font-medium">
            <CheckCircle2 size={16} />
            {t('conferencia.conferido_em', { data: new Date(importAtual.conferido_em).toLocaleString('pt-BR') })}
          </p>
        ) : (
          <div>
            <button
              onClick={handleLiberar}
              disabled={!todosBatem || liberando}
              className="px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('conferencia.liberar_acerto')}
            </button>
            <p className="text-xs text-gray-500 mt-1.5">{t('conferencia.liberar_aviso')}</p>
          </div>
        )
      )}
    </div>
  )
}

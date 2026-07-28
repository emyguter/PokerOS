'use client'
import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, Trash2, Link2 } from 'lucide-react'
import type { Regra, RegraVinculo, EntidadeTipo } from '@/lib/types'
import { getVinculos, addVinculo, removeVinculo, buscarEntidades } from '@/lib/cadastro-api'

interface Props {
  open: boolean
  regra: Regra | null
  onClose: () => void
}

const TIPOS: { value: EntidadeTipo; label: string }[] = [
  { value: 'liga', label: 'Liga' },
  { value: 'clube', label: 'Clube' },
  { value: 'agente', label: 'Agente / Super Agente' },
]

const LABEL_TIPO: Record<EntidadeTipo, string> = { liga: 'Liga', clube: 'Clube', agente: 'Agente' }

export function VinculosPanel({ open, regra, onClose }: Props) {
  const [vinculos, setVinculos] = useState<RegraVinculo[]>([])
  const [loading, setLoading] = useState(false)
  const [tipoBusca, setTipoBusca] = useState<EntidadeTipo>('clube')
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<{ id: string; nome: string }[]>([])
  const [buscando, setBuscando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!regra) return
    setLoading(true)
    try { setVinculos(await getVinculos(regra.id)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [regra])

  useEffect(() => { if (open) { load(); setBusca(''); setResultados([]); setError(null) } }, [open, load])

  useEffect(() => {
    if (!open) return
    setBuscando(true)
    const timer = setTimeout(() => {
      buscarEntidades(tipoBusca, busca).then(setResultados).finally(() => setBuscando(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [tipoBusca, busca, open])

  if (!open || !regra) return null

  async function handleAdd(entidadeId: string) {
    if (!regra) return
    setSaving(true); setError(null)
    try {
      await addVinculo(regra.id, tipoBusca, entidadeId)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function handleRemove(vinculoId: string) {
    setSaving(true); setError(null)
    try { await removeVinculo(vinculoId); await load() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const jaVinculados = new Set(vinculos.filter(v => v.entidade_tipo === tipoBusca).map(v => v.entidade_id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Vínculos — {regra.nome}</h2>
            <p className="text-xs text-gray-500">Onde essa regra é aplicada</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vinculada a</p>
            {loading ? (
              <p className="text-sm text-gray-500">Carregando...</p>
            ) : vinculos.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Nenhum vínculo ainda — essa regra não está sendo aplicada em nada.</p>
            ) : (
              <div className="space-y-1.5">
                {vinculos.map(v => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/10 bg-surface2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs">{LABEL_TIPO[v.entidade_tipo]}</span>
                      <span className="text-sm text-gray-200">{v.entidade_nome}</span>
                    </div>
                    <button onClick={() => handleRemove(v.id)} disabled={saving} className="text-gray-500 hover:text-alert transition-colors disabled:opacity-40"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Adicionar vínculo</p>
            <div className="flex gap-2">
              {TIPOS.map(t => (
                <button key={t.value} type="button" onClick={() => setTipoBusca(t.value)} className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${tipoBusca === t.value ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={`Buscar ${LABEL_TIPO[tipoBusca].toLowerCase()}...`}
              className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
            />
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {buscando ? (
                <p className="text-xs text-gray-500 px-1">Buscando...</p>
              ) : resultados.length === 0 ? (
                <p className="text-xs text-gray-500 px-1 italic">Nenhum resultado.</p>
              ) : (
                resultados.map(r => {
                  const vinculado = jaVinculados.has(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={vinculado || saving}
                      onClick={() => handleAdd(r.id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-white/10 text-left text-sm text-gray-300 hover:border-gold/40 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {r.nome}
                      {vinculado ? <span className="text-xs text-gray-500">já vinculado</span> : <Link2 size={13} className="text-gold" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
        </div>
      </div>
    </div>
  )
}

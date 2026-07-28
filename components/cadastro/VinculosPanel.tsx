'use client'
import { useState, useEffect, useCallback } from 'react'
import { X, Trash2, ArrowRight } from 'lucide-react'
import type { Regra, RegraVinculo, EntidadeTipo } from '@/lib/types'
import { getVinculos, addVinculo, removeVinculo, buscarEntidades } from '@/lib/cadastro-api'

interface Props {
  open: boolean
  regra: Regra | null
  onClose: () => void
}

const TIPOS: { value: EntidadeTipo; label: string }[] = [
  { value: 'plataforma', label: 'App' },
  { value: 'mega_liga', label: 'Mega Liga' },
  { value: 'superliga', label: 'Superliga' },
  { value: 'liga', label: 'Liga' },
  { value: 'clube', label: 'Clube' },
  { value: 'agente', label: 'Agente / Super Agente' },
  { value: 'jogador', label: 'Jogador' },
]

const LABEL_TIPO: Record<EntidadeTipo, string> = {
  plataforma: 'App',
  mega_liga: 'Mega Liga',
  superliga: 'Superliga',
  liga: 'Liga',
  clube: 'Clube',
  agente: 'Agente',
  jogador: 'Jogador',
}

interface Lado {
  tipo: EntidadeTipo
  busca: string
  resultados: { id: string; nome: string }[]
  selecionado: { id: string; nome: string } | null
  buscando: boolean
}

const LADO_INICIAL = (tipo: EntidadeTipo): Lado => ({ tipo, busca: '', resultados: [], selecionado: null, buscando: false })

function SeletorEntidade({ titulo, opcional, lado, onChange }: { titulo: string; opcional?: boolean; lado: Lado; onChange: (l: Lado) => void }) {
  useEffect(() => {
    if (lado.selecionado) return
    onChange({ ...lado, buscando: true })
    const timer = setTimeout(() => {
      buscarEntidades(lado.tipo, lado.busca).then(resultados => onChange({ ...lado, resultados, buscando: false }))
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lado.tipo, lado.busca])

  return (
    <div className="flex-1 space-y-1.5">
      <p className="text-xs text-gray-500">{titulo}{opcional && <span className="text-gray-600"> (opcional)</span>}</p>
      <select
        value={lado.tipo}
        onChange={e => onChange({ ...LADO_INICIAL(e.target.value as EntidadeTipo) })}
        className="w-full bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-gold/50"
      >
        {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {lado.selecionado ? (
        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-gold/40 bg-gold/5 text-sm text-white">
          {lado.selecionado.nome}
          <button type="button" onClick={() => onChange({ ...lado, selecionado: null, busca: '' })} className="text-gray-500 hover:text-alert"><X size={13} /></button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={lado.busca}
            onChange={e => onChange({ ...lado, busca: e.target.value })}
            placeholder={`Buscar ${LABEL_TIPO[lado.tipo].toLowerCase()}...`}
            className="w-full bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-gold/50"
          />
          <div className="max-h-32 overflow-y-auto space-y-1">
            {lado.buscando ? (
              <p className="text-xs text-gray-500 px-1">Buscando...</p>
            ) : lado.resultados.length === 0 ? (
              <p className="text-xs text-gray-500 px-1 italic">Nenhum resultado.</p>
            ) : (
              lado.resultados.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onChange({ ...lado, selecionado: r })}
                  className="w-full text-left px-2 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-gold/40 hover:text-white transition-colors"
                >
                  {r.nome}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function VinculosPanel({ open, regra, onClose }: Props) {
  const [vinculos, setVinculos] = useState<RegraVinculo[]>([])
  const [loading, setLoading] = useState(false)
  const [ladoDe, setLadoDe] = useState<Lado>(LADO_INICIAL('liga'))
  const [ladoPara, setLadoPara] = useState<Lado>(LADO_INICIAL('clube'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!regra) return
    setLoading(true)
    try { setVinculos(await getVinculos(regra.id)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [regra])

  useEffect(() => {
    if (!open) return
    load()
    setLadoDe(LADO_INICIAL('liga'))
    setLadoPara(LADO_INICIAL('clube'))
    setError(null)
  }, [open, load])

  if (!open || !regra) return null

  async function handleAdd() {
    if (!regra || !ladoPara.selecionado) return
    setSaving(true); setError(null)
    try {
      await addVinculo(
        regra.id,
        { tipo: ladoPara.tipo, id: ladoPara.selecionado.id },
        ladoDe.selecionado ? { tipo: ladoDe.tipo, id: ladoDe.selecionado.id } : null
      )
      setLadoDe(LADO_INICIAL('liga'))
      setLadoPara(LADO_INICIAL('clube'))
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Vínculos — {regra.nome}</h2>
            <p className="text-xs text-gray-500">De quem pra quem essa regra vale</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vínculos ativos</p>
            {loading ? (
              <p className="text-sm text-gray-500">Carregando...</p>
            ) : vinculos.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Nenhum vínculo ainda — essa regra não está sendo aplicada em nada.</p>
            ) : (
              <div className="space-y-1.5">
                {vinculos.map(v => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/10 bg-surface2">
                    <div className="flex items-center gap-2 text-sm">
                      {v.de_id ? (
                        <>
                          <span className="px-2 py-0.5 rounded-full bg-surface border border-white/10 text-gray-300 text-xs">{LABEL_TIPO[v.de_tipo!]}</span>
                          <span className="text-gray-200">{v.de_nome}</span>
                          <ArrowRight size={13} className="text-gray-500" />
                        </>
                      ) : (
                        <span className="text-xs text-gray-600 italic">sem origem</span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs">{LABEL_TIPO[v.para_tipo]}</span>
                      <span className="text-gray-200">{v.para_nome}</span>
                    </div>
                    <button onClick={() => handleRemove(v.id)} disabled={saving} className="text-gray-500 hover:text-alert transition-colors disabled:opacity-40"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-white/10">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Novo vínculo — de quem, pra quem</p>
            <div className="flex items-start gap-3">
              <SeletorEntidade titulo="De (quem define/cobra)" opcional lado={ladoDe} onChange={setLadoDe} />
              <ArrowRight size={16} className="text-gray-600 shrink-0 mt-6" />
              <SeletorEntidade titulo="Para (quem recebe a regra)" lado={ladoPara} onChange={setLadoPara} />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!ladoPara.selecionado || saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Vincular
            </button>
          </div>

          {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
        </div>
      </div>
    </div>
  )
}

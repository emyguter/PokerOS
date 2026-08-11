'use client'
import { useState, useEffect, useCallback } from 'react'
import { X, Trash2, ArrowRight, Pencil } from 'lucide-react'
import type { Regra, RegraVinculo, EntidadeTipo, CampoClube } from '@/lib/types'
import { getVinculos, addVinculo, updateVinculo, removeVinculo, buscarEntidades } from '@/lib/cadastro-api'
import { campoFromCondicoes } from '@/lib/indicadores'

interface Props {
  open: boolean
  regra: Regra | null
  resumo?: string
  indicadorNomePorId: Map<string, string>
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

const LABEL_CAMPO: Record<CampoClube, string> = {
  fee_mtt: 'Fee MTT', fee_cash: 'Fee Cash', taxa_op: 'Taxa Operacional', spinup: 'SpinUp',
}

interface Entidade { id: string; nome: string }

interface Lado {
  tipo: EntidadeTipo
  busca: string
  resultados: Entidade[]
  selecionados: Entidade[]
  buscando: boolean
}

const LADO_INICIAL = (tipo: EntidadeTipo): Lado => ({ tipo, busca: '', resultados: [], selecionados: [], buscando: false })
const LADO_COM = (tipo: EntidadeTipo, entidade: Entidade): Lado => ({ ...LADO_INICIAL(tipo), selecionados: [entidade] })

function SeletorEntidade({ titulo, opcional, multi, lado, onChange }: { titulo: string; opcional?: boolean; multi?: boolean; lado: Lado; onChange: (l: Lado) => void }) {
  useEffect(() => {
    onChange({ ...lado, buscando: true })
    const timer = setTimeout(() => {
      buscarEntidades(lado.tipo, lado.busca).then(resultados => onChange({ ...lado, resultados, buscando: false }))
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lado.tipo, lado.busca])

  const idsSelecionados = new Set(lado.selecionados.map(s => s.id))

  function toggle(entidade: Entidade) {
    if (multi) {
      onChange({ ...lado, selecionados: idsSelecionados.has(entidade.id) ? lado.selecionados.filter(s => s.id !== entidade.id) : [...lado.selecionados, entidade] })
    } else {
      onChange({ ...lado, selecionados: [entidade] })
    }
  }
  function remover(id: string) {
    onChange({ ...lado, selecionados: lado.selecionados.filter(s => s.id !== id) })
  }
  async function selecionarTodos() {
    onChange({ ...lado, buscando: true })
    // Sem limite de 20 aqui de propósito — "todos" precisa trazer tudo que
    // bate com a busca (ou o tipo inteiro, se a busca estiver vazia).
    const todos = await buscarEntidades(lado.tipo, lado.busca, 2000)
    const idsAtuais = new Set(lado.selecionados.map(s => s.id))
    onChange({ ...lado, resultados: todos, buscando: false, selecionados: [...lado.selecionados, ...todos.filter(t => !idsAtuais.has(t.id))] })
  }

  return (
    <div className="flex-1 space-y-1.5">
      <p className="text-xs text-gray-500">{titulo}{opcional && <span className="text-gray-600"> (opcional)</span>}{multi && <span className="text-gray-600"> — pode escolher vários</span>}</p>
      <select
        value={lado.tipo}
        onChange={e => onChange({ ...LADO_INICIAL(e.target.value as EntidadeTipo) })}
        className="w-full bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-gold/50"
      >
        {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {lado.selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {lado.selecionados.map(s => (
            <span key={s.id} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gold/40 bg-gold/5 text-xs text-white">
              {s.nome}
              <button type="button" onClick={() => remover(s.id)} className="text-gray-500 hover:text-alert"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {(multi || lado.selecionados.length === 0) && (
        <>
          <input
            type="text"
            value={lado.busca}
            onChange={e => onChange({ ...lado, busca: e.target.value })}
            placeholder={`Buscar ${LABEL_TIPO[lado.tipo].toLowerCase()}...`}
            className="w-full bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-gold/50"
          />
          {multi && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={selecionarTodos} disabled={lado.buscando} className="text-xs text-gold hover:underline disabled:opacity-40">
                Selecionar todos{lado.busca.trim() ? ' (dessa busca)' : ` (${LABEL_TIPO[lado.tipo].toLowerCase()})`}
              </button>
              {lado.selecionados.length > 0 && (
                <button type="button" onClick={() => onChange({ ...lado, selecionados: [] })} className="text-xs text-gray-500 hover:text-white">
                  Limpar seleção
                </button>
              )}
            </div>
          )}
          <div className="max-h-32 overflow-y-auto space-y-1">
            {lado.buscando ? (
              <p className="text-xs text-gray-500 px-1">Buscando...</p>
            ) : lado.resultados.length === 0 ? (
              <p className="text-xs text-gray-500 px-1 italic">Nenhum resultado.</p>
            ) : (
              lado.resultados.map(r => {
                const selecionado = idsSelecionados.has(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs transition-colors ${selecionado ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-300 hover:border-gold/40 hover:text-white'}`}
                  >
                    {r.nome}
                  </button>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function VinculosPanel({ open, regra, resumo, indicadorNomePorId, onClose }: Props) {
  const [vinculos, setVinculos] = useState<RegraVinculo[]>([])
  const [loading, setLoading] = useState(false)
  const [editando, setEditando] = useState<RegraVinculo | null>(null)
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

  function resetForm() {
    setEditando(null)
    setLadoDe(LADO_INICIAL('liga'))
    setLadoPara(LADO_INICIAL('clube'))
  }

  useEffect(() => {
    if (!open) return
    load()
    resetForm()
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load])

  if (!open || !regra) return null

  function editar(v: RegraVinculo) {
    setEditando(v)
    setLadoDe(v.de_id && v.de_tipo ? LADO_COM(v.de_tipo, { id: v.de_id, nome: v.de_nome ?? '—' }) : LADO_INICIAL('liga'))
    setLadoPara(LADO_COM(v.para_tipo, { id: v.para_id, nome: v.para_nome }))
  }

  async function handleSalvar() {
    if (!regra || ladoPara.selecionados.length === 0) return
    setSaving(true); setError(null)
    try {
      // Multi-seleção vale nos dois lados: o resultado é o produto cartesiano
      // De x Para (ex: 2 Ligas x 3 Clubes = 6 vínculos). Editando, a primeira
      // combinação atualiza o vínculo que abriu a edição; o resto vira vínculo novo.
      const des = ladoDe.selecionados.length > 0
        ? ladoDe.selecionados.map(d => ({ tipo: ladoDe.tipo, id: d.id }))
        : [null]
      const paras = ladoPara.selecionados.map(p => ({ tipo: ladoPara.tipo, id: p.id }))
      const combos = paras.flatMap(para => des.map(de => ({ de, para })))
      // Campo do clube que a regra substitui já vem do indicador usado na
      // condição da própria regra (Rake Cash → Fee Cash, Rake MTT → Fee MTT,
      // Rake Spinup → SpinUp) — não pergunta de novo aqui.
      const campoParaSalvar: CampoClube | null = ladoPara.tipo === 'clube' ? campoFromCondicoes(regra.condicoes, indicadorNomePorId) : null

      const [primeiro, ...resto] = combos
      if (editando) {
        await updateVinculo(editando.id, primeiro.para, primeiro.de, campoParaSalvar)
      } else {
        await addVinculo(regra.id, primeiro.para, primeiro.de, campoParaSalvar)
      }
      for (const c of resto) {
        await addVinculo(regra.id, c.para, c.de, campoParaSalvar)
      }
      resetForm()
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function handleRemove(vinculoId: string) {
    setSaving(true); setError(null)
    try {
      await removeVinculo(vinculoId)
      if (editando?.id === vinculoId) resetForm()
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Vínculos — {regra.nome}</h2>
            <p className="text-xs text-gray-500">{resumo ? resumo : 'De quem pra quem essa regra vale'}</p>
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
                  <div key={v.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${editando?.id === v.id ? 'border-gold/50 bg-gold/5' : 'border-white/10 bg-surface2'}`}>
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
                      {v.campo && (
                        <span className="px-2 py-0.5 rounded-full bg-surface border border-white/10 text-gray-400 text-xs">{LABEL_CAMPO[v.campo]}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => editar(v)} disabled={saving} className="p-1 text-gray-500 hover:text-gold transition-colors disabled:opacity-40"><Pencil size={14} /></button>
                      <button onClick={() => handleRemove(v.id)} disabled={saving} className="p-1 text-gray-500 hover:text-alert transition-colors disabled:opacity-40"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{editando ? 'Editando vínculo' : 'Novo vínculo — de quem, pra quem'}</p>
              {editando && <button type="button" onClick={resetForm} className="text-xs text-gray-500 hover:text-white">cancelar edição</button>}
            </div>
            <div className="flex items-start gap-3">
              <SeletorEntidade titulo="De (quem define/cobra)" opcional multi lado={ladoDe} onChange={setLadoDe} />
              <ArrowRight size={16} className="text-gray-600 shrink-0 mt-6" />
              <SeletorEntidade titulo="Para (quem recebe a regra)" multi lado={ladoPara} onChange={setLadoPara} />
            </div>
            {ladoPara.tipo === 'clube' && (() => {
              const campo = campoFromCondicoes(regra.condicoes, indicadorNomePorId)
              return campo ? (
                <p className="text-xs text-gray-500">Essa regra vai substituir <span className="text-gold">{LABEL_CAMPO[campo]}</span> do clube (indicador usado na condição).</p>
              ) : (
                <p className="text-xs text-alert">Essa regra não usa Rake Cash / Rake MTT / Rake Spinup na condição, então não dá pra saber qual taxa do clube ela substitui — o vínculo não vai afetar nenhum cálculo até a regra usar um desses indicadores.</p>
              )
            })()}
            {(() => {
              const totalCombos = Math.max(ladoDe.selecionados.length, 1) * ladoPara.selecionados.length
              return (
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={ladoPara.selecionados.length === 0 || saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {editando
                    ? (totalCombos > 1 ? `Salvar edição + vincular a mais ${totalCombos - 1}` : 'Salvar edição')
                    : (totalCombos > 1 ? `Vincular ${totalCombos} combinações` : 'Vincular')}
                </button>
              )
            })()}
          </div>

          {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
        </div>
      </div>
    </div>
  )
}

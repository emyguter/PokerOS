'use client'
import { useState, useEffect } from 'react'
import { X, Loader2, Plus, Trash2 } from 'lucide-react'
import type { Regra, RegraForm, RegraCondicaoForm, RegraTipo, FaixaMultaForm } from '@/lib/types'
import { formatIndicadorNome } from '@/lib/indicadores'
import { supabase } from '@/lib/supabase'

interface Indicador { id: string; nome: string; descricao: string | null }

interface Props {
  open: boolean
  editing: Regra | null
  onClose: () => void
  onSave: (form: RegraForm) => void
  saving: boolean
  error?: string | null
}

const EMPTY_COND: RegraCondicaoForm = { indicador_ids: [''], operador: '>', valor: null, resultado_pct: null, is_fallback: false }
const EMPTY_FAIXA: FaixaMultaForm = { quantidade: null, unidade: 'semanas', percentual: null }
const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'

export function RegraModal({ open, editing, onClose, onSave, saving, error }: Props) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<RegraTipo>('faixa')
  const [condicoes, setCondicoes] = useState<RegraCondicaoForm[]>([])
  const [faixasMulta, setFaixasMulta] = useState<FaixaMultaForm[]>([{ ...EMPTY_FAIXA }])
  const [indicadores, setIndicadores] = useState<Indicador[]>([])

  useEffect(() => {
    if (open) supabase.from('indicadores').select('*').order('nome').then(({ data }) => { if (data) setIndicadores(data) })
  }, [open])

  useEffect(() => {
    setNome(editing?.nome ?? '')
    setTipo(editing?.tipo ?? 'faixa')
    setCondicoes(editing?.condicoes ?? [])
    setFaixasMulta(editing?.faixasMulta && editing.faixasMulta.length > 0 ? editing.faixasMulta : [{ ...EMPTY_FAIXA }])
  }, [editing, open])

  if (!open) return null

  const addCondicao = () => setCondicoes(c => [...c, { ...EMPTY_COND }])
  const addFallback = () => { if (condicoes.some(c => c.is_fallback)) return; setCondicoes(c => [...c, { ...EMPTY_COND, is_fallback: true, operador: '>=' }]) }
  const removeCondicao = (i: number) => setCondicoes(c => c.filter((_, j) => j !== i))
  const setCondicao = (i: number, k: keyof RegraCondicaoForm, v: any) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, [k]: v } : item))
  const setTermo = (i: number, ti: number, v: string) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: item.indicador_ids.map((id, tj) => tj === ti ? v : id) } : item))
  const addTermo = (i: number) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: [...item.indicador_ids, ''] } : item))
  const removeTermo = (i: number, ti: number) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: item.indicador_ids.filter((_, tj) => tj !== ti) } : item))

  const addFaixa = () => setFaixasMulta(f => [...f, { ...EMPTY_FAIXA }])
  const removeFaixa = (i: number) => setFaixasMulta(f => f.filter((_, j) => j !== i))
  const setFaixa = (i: number, k: keyof FaixaMultaForm, v: any) => setFaixasMulta(f => f.map((item, j) => j === i ? { ...item, [k]: v } : item))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({ nome, tipo, condicoes, faixasMulta })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Regra' : 'Nova Regra'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Tipo de regra</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTipo('faixa')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${tipo === 'faixa' ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                  Cálculo de Acerto
                  <p className="text-xs font-normal text-gray-500 mt-0.5">Faixa SE/ENTÃO — % que varia por rake/ganhos</p>
                </button>
                <button type="button" onClick={() => setTipo('multa_atraso')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${tipo === 'multa_atraso' ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                  Multa de Acerto
                  <p className="text-xs font-normal text-gray-500 mt-0.5">% de multa por atraso, pra Dívidas e Acordos</p>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome<span className="text-gray-500 ml-1">*</span></label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} required placeholder={tipo === 'multa_atraso' ? 'Ex: Multa padrão por atraso' : 'Ex: 5%-15%'} className={inputCls} />
            </div>

            {tipo === 'multa_atraso' ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Faixas de atraso</p>
                <p className="text-xs text-gray-600">A maior faixa já atingida vale sozinha (não soma com as anteriores) — incide sobre o valor da parcela atrasada.</p>
                {faixasMulta.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 rounded-lg border border-white/10 bg-surface2">
                    <input
                      type="number" step="1" min="1" value={f.quantidade ?? ''}
                      onChange={e => setFaixa(i, 'quantidade', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="Ex: 1" className={`${inputCls} w-20`}
                    />
                    <select value={f.unidade} onChange={e => setFaixa(i, 'unidade', e.target.value)} className={`${inputCls} w-auto`}>
                      <option value="dias">dia(s)</option>
                      <option value="semanas">semana(s)</option>
                    </select>
                    <span className="text-gray-500 text-sm">de atraso →</span>
                    <input
                      type="number" step="any" value={f.percentual ?? ''}
                      onChange={e => setFaixa(i, 'percentual', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="Ex: 2" className={`${inputCls} w-24`}
                    />
                    <span className="text-gray-500 text-sm">%</span>
                    {faixasMulta.length > 1 && (
                      <button type="button" onClick={() => removeFaixa(i)} className="ml-auto text-gray-500 hover:text-alert transition-colors"><Trash2 size={14} /></button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addFaixa} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:border-gold/50 hover:text-white transition-all">
                  <Plus size={12} />Faixa
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Condições SE / ENTÃO</p>
                {condicoes.map((c, i) => (
                  <div key={i} className={`p-3 rounded-lg border space-y-2 ${c.is_fallback ? 'border-gold/30 bg-gold/5' : 'border-white/10 bg-surface2'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-400">{c.is_fallback ? 'SENÃO' : `SE ${i + 1}`}</span>
                      <button type="button" onClick={() => removeCondicao(i)} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={13} /></button>
                    </div>
                    {!c.is_fallback && (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {c.indicador_ids.map((id, ti) => (
                            <div key={ti} className="flex items-center gap-1">
                              {ti > 0 && <span className="text-gray-500 text-xs">+</span>}
                              <select value={id} onChange={e => setTermo(i, ti, e.target.value)} className={`${inputCls} w-auto`}>
                                <option value="">Indicador</option>
                                {indicadores.map(ind => <option key={ind.id} value={ind.id}>{formatIndicadorNome(ind.nome, ind.descricao)}</option>)}
                              </select>
                              {c.indicador_ids.length > 1 && (
                                <button type="button" onClick={() => removeTermo(i, ti)} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={12} /></button>
                              )}
                            </div>
                          ))}
                          <button type="button" onClick={() => addTermo(i)} className="text-gold text-xs hover:underline">+ variável</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select value={c.operador} onChange={e => setCondicao(i, 'operador', e.target.value)} className={inputCls}>
                            {['>', '>=', '<', '<='].map(op => <option key={op} value={op}>{op}</option>)}
                          </select>
                          <input type="number" step="any" value={c.valor ?? ''} onChange={e => setCondicao(i, 'valor', e.target.value === '' ? null : Number(e.target.value))} placeholder="Valor" className={inputCls} />
                        </div>
                      </>
                    )}
                    <input type="number" step="any" value={c.resultado_pct ?? ''} onChange={e => setCondicao(i, 'resultado_pct', e.target.value === '' ? null : Number(e.target.value))} placeholder="Resultado (%)" className={inputCls} />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={addCondicao} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:border-gold/50 hover:text-white transition-all">
                    <Plus size={12} />SE condição
                  </button>
                  {!condicoes.some(c => c.is_fallback) && (
                    <button type="button" onClick={addFallback} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:border-gold/50 hover:text-white transition-all">
                      <Plus size={12} />SENÃO (regra padrão)
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar Regra
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

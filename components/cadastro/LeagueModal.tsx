'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Plus, Trash2, Search } from 'lucide-react'
import type { League, LeagueForm, SuperLeague, Plataforma } from '@/lib/types'
import { MOEDAS } from '@/lib/moedas'
import { supabase } from '@/lib/supabase'

interface Condicao {
  indicador_id: string
  operador: string
  valor: number | null
  resultado_pct: number | null
  is_fallback: boolean
}

interface Indicador { id: string; nome: string; descricao: string | null }

interface Props {
  open: boolean
  editing: League | null
  superLeagues: SuperLeague[]
  plataformas: Plataforma[]
  onClose: () => void
  onSave: (form: LeagueForm, condicoes: Condicao[]) => void
  saving: boolean
}

const EMPTY: LeagueForm = {
  name: '', moeda: 'BRL', taxa_app_pct: null, ratio: null, super_league_id: null,
  plataforma_id: null, clube_ext_id: null, clube_nickname: null,
  operador_ext_id: null, operador_nickname: null, moeda_acerto: 'BRL', conversao_dia: false
}

const EMPTY_COND: Condicao = { indicador_id: '', operador: '>', valor: null, resultado_pct: null, is_fallback: false }

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'
const inputLockedCls = 'w-full bg-surface/50 border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-sm cursor-not-allowed'

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">{title}</h3>
      {children}
    </div>
  )
}

function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}{required && <span className="text-gold ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

// Linha com ID + Nickname lado a lado
function IdNickRow({ idLabel, idValue, idPlaceholder, idLocked, onIdChange, nickValue, nickPlaceholder, nickLocked, onNickChange, searching }: {
  idLabel: string; idValue: string; idPlaceholder: string; idLocked: boolean; onIdChange: (v: string) => void
  nickValue: string; nickPlaceholder: string; nickLocked: boolean; onNickChange: (v: string) => void
  searching?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Fld label={idLabel}>
        <div className="relative">
          <input
            type="text"
            value={idValue}
            onChange={e => onIdChange(e.target.value)}
            placeholder={idPlaceholder}
            disabled={idLocked}
            className={idLocked ? inputLockedCls : inputCls}
          />
          {searching && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
        </div>
      </Fld>
      <Fld label="Nickname">
        <input
          type="text"
          value={nickValue}
          onChange={e => onNickChange(e.target.value)}
          placeholder={nickPlaceholder}
          disabled={nickLocked}
          className={nickLocked ? inputLockedCls : inputCls}
        />
      </Fld>
    </div>
  )
}

export function LeagueModal({ open, editing, superLeagues, plataformas, onClose, onSave, saving }: Props) {
  const [form, setForm] = useState<LeagueForm>(EMPTY)
  const [condicoes, setCondicoes] = useState<Condicao[]>([])
  const [indicadores, setIndicadores] = useState<Indicador[]>([])
  const [clubeLocked, setClubeLocked] = useState(false)
  const [usuarioLocked, setUsuarioLocked] = useState(false)
  const [searchingClube, setSearchingClube] = useState(false)
  const [searchingUsuario, setSearchingUsuario] = useState(false)
  const clubeTimer = useRef<NodeJS.Timeout | null>(null)
  const usuarioTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (open) {
      supabase.from('indicadores').select('*').order('nome').then(({ data }) => {
        if (data) setIndicadores(data)
      })
    }
  }, [open])

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name, moeda: editing.moeda, taxa_app_pct: editing.taxa_app_pct,
        ratio: editing.ratio, super_league_id: editing.super_league_id,
        plataforma_id: editing.plataforma_id ?? null,
        clube_ext_id: editing.clube_ext_id ?? null,
        clube_nickname: editing.clube_nickname ?? null,
        operador_ext_id: editing.operador_ext_id ?? null,
        operador_nickname: editing.operador_nickname ?? null,
        moeda_acerto: editing.moeda_acerto ?? 'BRL',
        conversao_dia: editing.conversao_dia ?? false,
      })
      setClubeLocked(!!editing.clube_nickname)
      setUsuarioLocked(!!editing.operador_nickname)

      supabase.from('regra_entidades')
        .select('regra_id, regras(id, moeda, conversao_dia, regra_condicoes(*))')
        .eq('entidade_tipo', 'liga')
        .eq('entidade_id', editing.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.regras) {
            const r = data.regras as any
            setCondicoes((r.regra_condicoes ?? []).map((c: any) => ({
              indicador_id: c.indicador_id ?? '',
              operador: c.operador,
              valor: c.valor,
              resultado_pct: c.resultado_pct,
              is_fallback: c.is_fallback,
            })))
          } else setCondicoes([])
        })
    } else {
      setForm(EMPTY)
      setCondicoes([])
      setClubeLocked(false)
      setUsuarioLocked(false)
    }
  }, [editing, open])

  if (!open) return null

  const set = (k: keyof LeagueForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  // Busca clube pelo external_id na plataforma selecionada
  const handleClubeIdChange = (v: string) => {
    set('clube_ext_id', v || null)
    set('clube_nickname', null)
    setClubeLocked(false)
    clearTimeout(clubeTimer.current ?? undefined)
    if (!v || !form.plataforma_id) return
    clubeTimer.current = setTimeout(async () => {
      setSearchingClube(true)
      const { data } = await supabase
        .from('clubs')
        .select('name, external_id')
        .eq('external_id', v)
        .maybeSingle()
      setSearchingClube(false)
      if (data) { set('clube_nickname', data.name); setClubeLocked(true) }
    }, 600)
  }

  // Busca usuário em todas as entidades com external_id
  const handleUsuarioIdChange = async (v: string) => {
    set('operador_ext_id', v || null)
    set('operador_nickname', null)
    setUsuarioLocked(false)
    clearTimeout(usuarioTimer.current ?? undefined)
    if (!v) return
    usuarioTimer.current = setTimeout(async () => {
      setSearchingUsuario(true)
      // Busca em paralelo em todas as entidades
      const [agente, jogador, clube, liga] = await Promise.all([
        supabase.from('agentes').select('nome, external_id').eq('external_id', v).maybeSingle(),
        supabase.from('jogadores').select('nome, external_id').eq('external_id', v).maybeSingle(),
        supabase.from('clubs').select('name, external_id').eq('external_id', v).maybeSingle(),
        supabase.from('leagues').select('name, clube_ext_id').eq('clube_ext_id', v).maybeSingle(),
      ])
      setSearchingUsuario(false)
      const found = agente.data?.nome || jogador.data?.nome || clube.data?.name || liga.data?.name
      if (found) { set('operador_nickname', found); setUsuarioLocked(true) }
    }, 600)
  }

  const addCondicao = () => setCondicoes(c => [...c, { ...EMPTY_COND }])
  const addFallback = () => { if (condicoes.some(c => c.is_fallback)) return; setCondicoes(c => [...c, { ...EMPTY_COND, is_fallback: true, operador: '=' }]) }
  const removeCondicao = (i: number) => setCondicoes(c => c.filter((_, j) => j !== i))
  const setCondicao = (i: number, k: keyof Condicao, v: any) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, [k]: v } : item))

  const slOptions = [{ value: '', label: '— Nenhuma —' }, ...superLeagues.map(sl => ({ value: sl.id, label: sl.name }))]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Liga' : 'Nova Liga'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSave(form, condicoes) }} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

            {/* Identificação */}
            <Sec title="Identificação">
              <Fld label="Nome" required>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Ex: LP, ORION, SUL_HG" className={inputCls} />
              </Fld>
              <div className="grid grid-cols-2 gap-4">
                <Fld label="Superliga">
                  <select value={form.super_league_id ?? ''} onChange={e => set('super_league_id', e.target.value || null)} className={inputCls}>
                    {slOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Fld>
                <Fld label="Moeda do Acerto">
                  <select value={form.moeda_acerto ?? 'BRL'} onChange={e => set('moeda_acerto', e.target.value)} className={inputCls}>
                    {MOEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Fld>
              </div>
            </Sec>

            {/* Usuário na Plataforma */}
            <Sec title="Usuário na Plataforma">
              <p className="text-xs text-gray-500">Cada plataforma é um clube diferente. IDs cadastrados são preenchidos automaticamente.</p>
              <Fld label="Plataforma (App)">
                <select value={form.plataforma_id ?? ''} onChange={e => set('plataforma_id', e.target.value || null)} className={inputCls}>
                  <option value="">— Selecione —</option>
                  {plataformas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Fld>
              <IdNickRow
                idLabel="ID do Clube"
                idValue={form.clube_ext_id ?? ''}
                idPlaceholder="Ex: 1548056"
                idLocked={false}
                onIdChange={handleClubeIdChange}
                nickValue={form.clube_nickname ?? ''}
                nickPlaceholder="Preenchido automaticamente"
                nickLocked={clubeLocked}
                onNickChange={v => { set('clube_nickname', v || null); setClubeLocked(false) }}
                searching={searchingClube}
              />
              <IdNickRow
                idLabel="ID do Usuário"
                idValue={form.operador_ext_id ?? ''}
                idPlaceholder="Ex: 12034210"
                idLocked={false}
                onIdChange={handleUsuarioIdChange}
                nickValue={form.operador_nickname ?? ''}
                nickPlaceholder="Preenchido automaticamente"
                nickLocked={usuarioLocked}
                onNickChange={v => { set('operador_nickname', v || null); setUsuarioLocked(false) }}
                searching={searchingUsuario}
              />
            </Sec>

            {/* Regras */}
            <Sec title="Regras — Taxa do App">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => set('conversao_dia', !form.conversao_dia)}
                    className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${form.conversao_dia ? 'bg-gold' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.conversao_dia ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-sm text-gray-300">Conversão do dia</span>
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Condições SE / ENTÃO</p>
                {condicoes.map((c, i) => (
                  <div key={i} className={`p-3 rounded-lg border space-y-2 ${c.is_fallback ? 'border-gold/30 bg-gold/5' : 'border-white/10 bg-surface2'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-400">{c.is_fallback ? 'SENÃO' : `SE ${i + 1}`}</span>
                      <button type="button" onClick={() => removeCondicao(i)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </div>
                    {!c.is_fallback && (
                      <div className="grid grid-cols-3 gap-2">
                        <select value={c.indicador_id} onChange={e => setCondicao(i, 'indicador_id', e.target.value)} className={inputCls}>
                          <option value="">Indicador</option>
                          {indicadores.map(ind => <option key={ind.id} value={ind.id}>{ind.nome}</option>)}
                        </select>
                        <select value={c.operador} onChange={e => setCondicao(i, 'operador', e.target.value)} className={inputCls}>
                          {['>', '>=', '<', '<=', '='].map(op => <option key={op} value={op}>{op}</option>)}
                        </select>
                        <input type="number" step="any" value={c.valor ?? ''} onChange={e => setCondicao(i, 'valor', e.target.value === '' ? null : Number(e.target.value))} placeholder="Valor" className={inputCls} />
                      </div>
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
                      <Plus size={12} />SENÃO (fallback)
                    </button>
                  )}
                </div>
              </div>
            </Sec>

          </div>

          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar Liga
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
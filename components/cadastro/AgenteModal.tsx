'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Plus, Trash2, Search, AlertTriangle } from 'lucide-react'
import type { Agente, AgenteForm, AgentePlataforma, Plataforma, ClubeVinculado } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { RegrasAplicadas } from './RegrasAplicadas'

interface VinculoState extends AgentePlataforma {
  searching: boolean
  status: 'idle' | 'found_agente' | 'found_import' | 'not_found' | 'conflict'
  conflictNome?: string
}

interface AgenteOpcao { id: string; nome: string }

interface Props {
  open: boolean
  editing: Agente | null
  vinculosIniciais: AgentePlataforma[]
  clubesVinculadosIniciais: ClubeVinculado[]
  subAgentesIniciais?: { id: string; nome: string; email: string | null }[]
  plataformas: Plataforma[]
  onClose: () => void
  onSave: (form: AgenteForm, vinculos: AgentePlataforma[], clubes: { id: string; rakeback_pct: number | null }[], subAgenteIds: string[]) => void
  saving: boolean
  error?: string | null
  esconderSuperAgente?: boolean
}

const EMPTY: AgenteForm = { nome: '', email: null, telefone: null, superagente_id: null }
const EMPTY_VINCULO: VinculoState = { plataforma_id: '', external_id: '', nickname: null, searching: false, status: 'idle' }

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'
const inputLockedCls = 'w-full bg-surface/50 border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-sm cursor-not-allowed'

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-3">{title && <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">{title}</h3>}{children}</div>
}
function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-300 mb-1.5">{label}{required && <span className="text-gray-500 ml-1">*</span>}</label>{children}</div>
}

export function AgenteModal({ open, editing, vinculosIniciais, clubesVinculadosIniciais, subAgentesIniciais = [], plataformas, onClose, onSave, saving, error, esconderSuperAgente }: Props) {
  const [form, setForm] = useState<AgenteForm>(EMPTY)
  const [vinculos, setVinculos] = useState<VinculoState[]>([])
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const [clubesSelecionados, setClubesSelecionados] = useState<ClubeVinculado[]>([])
  const [buscaClube, setBuscaClube] = useState('')
  const [resultadosClube, setResultadosClube] = useState<ClubeVinculado[]>([])
  const [buscandoClube, setBuscandoClube] = useState(false)
  const clubeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [subAgentes, setSubAgentes] = useState<{ id: string; nome: string; email: string | null }[]>([])
  const [buscaSubAgente, setBuscaSubAgente] = useState('')
  const [resultadosSubAgente, setResultadosSubAgente] = useState<{ id: string; nome: string; email: string | null }[]>([])
  const subAgenteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [agentesLista, setAgentesLista] = useState<AgenteOpcao[]>([])

  useEffect(() => {
    if (open) {
      supabase.from('agentes').select('id, nome').order('nome').then(({ data }) => { if (data) setAgentesLista(data) })
    }
  }, [open])

  useEffect(() => { setSubAgentes(subAgentesIniciais ?? []) }, [subAgentesIniciais, open])

  useEffect(() => {
    if (subAgenteTimer.current) clearTimeout(subAgenteTimer.current)
    if (!buscaSubAgente.trim()) { setResultadosSubAgente([]); return }
    subAgenteTimer.current = setTimeout(async () => {
      const q = buscaSubAgente.trim()
      let query = supabase.from('agentes').select('id, nome, email').ilike('nome', `%${q}%`).limit(6)
      if (editing) query = query.neq('id', editing.id)
      const { data } = await query
      setResultadosSubAgente((data ?? []).filter(a => !subAgentes.some(s => s.id === a.id)))
    }, 400)
  }, [buscaSubAgente, editing, subAgentes])

  useEffect(() => {
    setForm(editing ? { nome: editing.nome, email: editing.email, telefone: editing.telefone, superagente_id: editing.superagente_id ?? null } : EMPTY)
    setVinculos(
      vinculosIniciais.length > 0
        ? vinculosIniciais.map(v => ({ ...v, searching: false, status: 'found_agente' as const }))
        : [{ ...EMPTY_VINCULO }]
    )
    setClubesSelecionados(clubesVinculadosIniciais)
    setBuscaClube('')
    setResultadosClube([])
  }, [editing, open, vinculosIniciais, clubesVinculadosIniciais])

  useEffect(() => {
    if (clubeTimer.current) clearTimeout(clubeTimer.current)
    if (!buscaClube.trim()) { setResultadosClube([]); return }
    clubeTimer.current = setTimeout(async () => {
      setBuscandoClube(true)
      try {
        const q = buscaClube.trim()
        const { data } = await supabase
          .from('clubs')
          .select('id, name, external_id, plataforma_id, leagues(name)')
          .or(`name.ilike.%${q}%,external_id.ilike.%${q}%`)
          .limit(5)
        setResultadosClube((data ?? []).map((c: any) => ({
          id: c.id, name: c.name, external_id: c.external_id, plataforma_id: c.plataforma_id,
          leagueName: c.leagues?.name ?? null, rakeback_pct: null,
        })))
      } finally {
        setBuscandoClube(false)
      }
    }, 400)
  }, [buscaClube])

  if (!open) return null

  const set = (k: keyof AgenteForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  const addVinculo = () => setVinculos(v => [...v, { ...EMPTY_VINCULO }])
  const removeVinculo = (i: number) => setVinculos(v => v.filter((_, j) => j !== i))
  const setVinculo = (i: number, patch: Partial<VinculoState>) =>
    setVinculos(v => v.map((item, j) => j === i ? { ...item, ...patch } : item))

  const plataformasDisponiveis = (atual: string) =>
    plataformas.filter(p => p.id === atual || !vinculos.some(v => v.plataforma_id === p.id))

  const agentesDisponiveis = agentesLista.filter(a => a.id !== editing?.id)

  const buscar = (i: number, plataformaId: string, externalId: string) => {
    if (timers.current[i]) clearTimeout(timers.current[i])
    setVinculo(i, { status: 'idle', nickname: null })
    if (!plataformaId || !externalId.trim()) return
    timers.current[i] = setTimeout(async () => {
      setVinculo(i, { searching: true })
      try {
        const { data: existente } = await supabase
          .from('agente_plataformas')
          .select('agente_id, nickname, agentes(nome)')
          .eq('plataforma_id', plataformaId)
          .eq('external_id', externalId.trim())
          .maybeSingle()

        if (existente) {
          const ehOutroAgente = editing ? existente.agente_id !== editing.id : true
          if (ehOutroAgente) {
            setVinculo(i, {
              searching: false, status: 'conflict',
              nickname: existente.nickname,
              conflictNome: (existente as any).agentes?.nome,
            })
          } else {
            setVinculo(i, { searching: false, status: 'found_agente', nickname: existente.nickname })
          }
          return
        }

        const { data: importado } = await supabase
          .from('import_rows')
          .select('agente_nome, imports!inner(plataforma_id)')
          .eq('agente_id_ext', externalId.trim())
          .eq('imports.plataforma_id', plataformaId)
          .limit(1)
          .maybeSingle()

        if (importado?.agente_nome) {
          setVinculo(i, { searching: false, status: 'found_import', nickname: importado.agente_nome })
        } else {
          setVinculo(i, { searching: false, status: 'not_found', nickname: null })
        }
      } catch {
        setVinculo(i, { searching: false, status: 'not_found' })
      }
    }, 500)
  }

  const addClube = (c: ClubeVinculado) => {
    if (clubesSelecionados.some(x => x.id === c.id)) return
    setClubesSelecionados(prev => [...prev, c])
    setBuscaClube(''); setResultadosClube([])
  }
  const removeClube = (id: string) => setClubesSelecionados(prev => prev.filter(c => c.id !== id))

  const temConflito = vinculos.some(v => v.status === 'conflict')
  const podeSalvar = form.nome.trim().length > 0 && !temConflito

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">
            {esconderSuperAgente
              ? (editing ? 'Editar Super Agente' : 'Novo Super Agente')
              : (editing ? 'Editar Agente' : 'Novo Agente')}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (podeSalvar) onSave(form, vinculos, clubesSelecionados.map(c => ({ id: c.id, rakeback_pct: c.rakeback_pct })), subAgentes.map(a => a.id)) }} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            <Sec title="Identificação">
              <Fld label="Nome" required>
                <input type="text" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome do agente" className={inputCls} />
              </Fld>
              <div className="grid grid-cols-2 gap-4">
                <Fld label="Email">
                  <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value || null)} placeholder="opcional" className={inputCls} />
                </Fld>
                <Fld label="Telefone">
                  <input type="text" value={form.telefone ?? ''} onChange={e => set('telefone', e.target.value || null)} placeholder="opcional" className={inputCls} />
                </Fld>
              </div>
            </Sec>

            {!esconderSuperAgente && (
              <Sec title="Hierarquia">
                <Fld label="Super Agente">
                  <select value={form.superagente_id ?? ''} onChange={e => set('superagente_id', e.target.value || null)} className={inputCls}>
                    <option value="">— Nenhum (agente direto) —</option>
                    {agentesDisponiveis.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                  <p className="text-xs text-gray-500 mt-1.5">Se esse agente responde a um Super Agente, selecione acima. Deixe em branco se ele é direto.</p>
                </Fld>
              </Sec>
            )}

            <Sec title="Agentes Vinculados">
              <p className="text-xs text-gray-500">Agentes que respondem a este. Se adicionar alguém aqui, este agente vira um Super Agente.</p>
              <div className="relative">
                <input type="text" value={buscaSubAgente} onChange={e => setBuscaSubAgente(e.target.value)} placeholder="Buscar agente por nome..." className={inputCls} />
                {resultadosSubAgente.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-surface2 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                    {resultadosSubAgente.map(a => (
                      <button key={a.id} type="button" onClick={() => { setSubAgentes(prev => [...prev, a]); setBuscaSubAgente(''); setResultadosSubAgente([]) }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors">
                        {a.nome} {a.email && <span className="text-gray-500">({a.email})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {subAgentes.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface2">
                  <span className="text-sm text-white">{a.nome}</span>
                  <button type="button" onClick={() => setSubAgentes(prev => prev.filter(x => x.id !== a.id))} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </Sec>

            <Sec title="Plataformas">
              <p className="text-xs text-gray-500">O agente pode ter um ID diferente em cada plataforma. Adicione um vínculo por plataforma.</p>
              {vinculos.map((v, i) => (
                <div key={i} className="p-3 rounded-lg border border-white/10 bg-surface2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-400">Plataforma {i + 1}</span>
                    {vinculos.length > 1 && (
                      <button type="button" onClick={() => removeVinculo(i)} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={13} /></button>
                    )}
                  </div>
                  <select
                    value={v.plataforma_id}
                    onChange={e => setVinculo(i, { plataforma_id: e.target.value, external_id: '', nickname: null, status: 'idle' })}
                    className={inputCls}
                  >
                    <option value="">— Selecione a plataforma —</option>
                    {plataformasDisponiveis(v.plataforma_id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <Fld label="ID nessa plataforma" required>
                      <div className="relative">
                        <input
                          type="text"
                          value={v.external_id}
                          onChange={e => { setVinculo(i, { external_id: e.target.value }); buscar(i, v.plataforma_id, e.target.value) }}
                          placeholder="Ex: 12034210"
                          disabled={!v.plataforma_id}
                          className={inputCls}
                        />
                        {v.searching && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
                      </div>
                    </Fld>
                    <Fld label="Nickname">
                      <input
                        type="text"
                        value={v.nickname ?? ''}
                        onChange={e => setVinculo(i, { nickname: e.target.value || null })}
                        placeholder="Preenchido automaticamente"
                        disabled={v.status === 'found_agente' || v.status === 'found_import'}
                        className={(v.status === 'found_agente' || v.status === 'found_import') ? inputLockedCls : inputCls}
                      />
                    </Fld>
                  </div>
                  {v.status === 'found_import' && (
                    <p className="text-xs text-gold/80">⚠ Esse ID já apareceu em importações ({v.nickname}), mas ainda não tinha cadastro. Vai ser vinculado agora.</p>
                  )}
                  {v.status === 'not_found' && (
                    <p className="text-xs text-gray-500">ID novo — preencha o nickname pra cadastrar.</p>
                  )}
                  {v.status === 'conflict' && (
                    <p className="text-xs text-alert flex items-center gap-1.5"><AlertTriangle size={12} />Esse ID já pertence a outro agente ({v.conflictNome}). Verifique antes de salvar.</p>
                  )}
                </div>
              ))}
              <button type="button" onClick={addVinculo} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:border-gold/50 hover:text-white transition-all">
                <Plus size={12} />Adicionar plataforma
              </button>
            </Sec>

            <Sec title="Clubes">
              <p className="text-xs text-gray-500">Em quais clubes esse agente atua. O ID/nickname dele em cada clube vem automaticamente da plataforma daquele clube.</p>
              <div className="relative">
                <input
                  type="text" value={buscaClube} onChange={e => setBuscaClube(e.target.value)}
                  placeholder="Buscar clube por ID ou nome..." className={inputCls}
                />
                {buscandoClube && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
                {resultadosClube.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-surface2 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                    {resultadosClube.map(c => (
                      <button
                        key={c.id} type="button" onClick={() => addClube(c)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                      >
                        {c.name} <span className="text-gray-500">({c.external_id ?? 'sem ID'})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {clubesSelecionados.map(c => {
                const v = vinculos.find(x => x.plataforma_id === c.plataforma_id && x.external_id)
                const plataformaNome = plataformas.find(p => p.id === c.plataforma_id)?.nome ?? '— sem plataforma —'
                return (
                  <div key={c.id} className="p-3 rounded-lg border border-white/10 bg-surface2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white font-medium">{c.name}</span>
                      <button type="button" onClick={() => removeClube(c.id)} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={13} /></button>
                    </div>
                    <p className="text-xs text-gray-500">Liga: {c.leagueName ?? '— sem liga —'} · Plataforma: {plataformaNome}</p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 shrink-0">Rakeback nesse clube</label>
                      <input
                        type="number" step="any" placeholder="0"
                        value={c.rakeback_pct ?? ''}
                        onChange={e => setClubesSelecionados(prev => prev.map(x => x.id === c.id ? { ...x, rakeback_pct: e.target.value === '' ? null : Number(e.target.value) } : x))}
                        className="w-20 bg-surface border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-gold/50"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                    {v ? (
                      <p className="text-xs text-gold/80">ID do agente nesse clube: {v.external_id} {v.nickname ? `(${v.nickname})` : ''}</p>
                    ) : (
                      <p className="text-xs text-alert flex items-center gap-1.5">
                        <AlertTriangle size={12} />Cadastre o ID do agente na plataforma "{plataformaNome}" na seção acima.
                      </p>
                    )}
                  </div>
                )
              })}
            </Sec>

            <Sec title="Rakeback do Jogador">
              <p className="text-xs text-gray-500">Rakeback aplicado aos jogadores desse agente.</p>
              <RegrasAplicadas entidadeTipo="agente" entidadeId={editing?.id ?? null} />
            </Sec>

          </div>
          {error && (
            <div className="shrink-0 mx-6 mb-4 p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>
          )}
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving || !podeSalvar} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar {esconderSuperAgente ? 'Super Agente' : 'Agente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
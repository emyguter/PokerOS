'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Search, AlertTriangle } from 'lucide-react'
import type { Agente, AgenteForm, AgentePlataforma, Plataforma, ClubeVinculado } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { RegrasAplicadas } from './RegrasAplicadas'
import { StepModal, type ModalStep } from './StepModal'
import { BuscaSelect } from '@/components/BuscaSelect'
import { useI18n } from '@/lib/i18n'

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

function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-300 mb-1.5">{label}{required && <span className="text-gray-500 ml-1">*</span>}</label>{children}</div>
}

export function AgenteModal({ open, editing, vinculosIniciais, clubesVinculadosIniciais, subAgentesIniciais = [], plataformas, onClose, onSave, saving, error, esconderSuperAgente }: Props) {
  const { t } = useI18n()
  const [form, setForm] = useState<AgenteForm>(EMPTY)
  const [step, setStep] = useState('identificacao')
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

  // "Agentes Vinculados" só faz sentido em Super Agente — é o que faz um
  // agente virar Super Agente. Num Agente comum, não tem o que vincular
  // abaixo dele.
  const STEPS: ModalStep[] = [
    { key: 'identificacao', label: t('agente_modal.step_identificacao') },
    ...(esconderSuperAgente ? [] : [{ key: 'hierarquia', label: t('agente_modal.step_hierarquia') }]),
    ...(esconderSuperAgente ? [{ key: 'sub_agentes', label: t('agente_modal.step_sub_agentes') }] : []),
    { key: 'plataformas', label: t('agente_modal.step_plataformas') },
    { key: 'clubes', label: t('agente_modal.step_clubes') },
    { key: 'rakeback', label: t('agente_modal.step_rakeback') },
  ]

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
    setStep('identificacao')
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
    <StepModal
      open={open}
      title={esconderSuperAgente ? (editing ? t('agente_modal.title_edit_super') : t('agente_modal.title_new_super')) : (editing ? t('agente_modal.title_edit') : t('agente_modal.title_new'))}
      steps={STEPS}
      active={step}
      onStepChange={setStep}
      onClose={onClose}
      onSubmit={e => { e.preventDefault(); if (podeSalvar) onSave(form, vinculos, clubesSelecionados.map(c => ({ id: c.id, rakeback_pct: c.rakeback_pct })), subAgentes.map(a => a.id)) }}
      saving={saving}
      error={error}
      submitLabel={t('agente_modal.submit_label', { tipo: esconderSuperAgente ? t('agente_modal.submit_super') : t('agente_modal.submit_agente') })}
    >
      {step === 'identificacao' && (
        <>
          <Fld label={t('agente_modal.nome_label')} required>
            <input type="text" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder={t('agente_modal.nome_placeholder')} className={inputCls} />
          </Fld>
          <div className="grid grid-cols-2 gap-4">
            <Fld label={t('agente_modal.email_label')}>
              <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value || null)} placeholder={t('agente_modal.opcional_placeholder')} className={inputCls} />
            </Fld>
            <Fld label={t('agente_modal.telefone_label')}>
              <input type="text" value={form.telefone ?? ''} onChange={e => set('telefone', e.target.value || null)} placeholder={t('agente_modal.opcional_placeholder')} className={inputCls} />
            </Fld>
          </div>
        </>
      )}

      {step === 'hierarquia' && !esconderSuperAgente && (
        <Fld label={t('agente_modal.super_agente_label')}>
          <BuscaSelect
            value={form.superagente_id ?? ''}
            onChange={v => set('superagente_id', v || null)}
            opcoes={agentesDisponiveis.map(a => ({ id: a.id, nome: a.nome }))}
            vazio={t('agente_modal.super_agente_vazio')}
            className={inputCls}
          />
          <p className="text-xs text-gray-500 mt-1.5">{t('agente_modal.super_agente_desc')}</p>
        </Fld>
      )}

      {step === 'sub_agentes' && (
        <>
          <p className="text-xs text-gray-500">{t('agente_modal.sub_agentes_desc')}</p>
          <div className="relative">
            <input type="text" value={buscaSubAgente} onChange={e => setBuscaSubAgente(e.target.value)} placeholder={t('agente_modal.buscar_agente_placeholder')} className={inputCls} />
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
        </>
      )}

      {step === 'plataformas' && (
        <>
          <p className="text-xs text-gray-500">{t('agente_modal.plataformas_desc')}</p>
          {vinculos.map((v, i) => (
            <div key={i} className="p-3 rounded-lg border border-white/10 bg-surface2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">{t('agente_modal.plataforma_numero', { n: i + 1 })}</span>
                {vinculos.length > 1 && (
                  <button type="button" onClick={() => removeVinculo(i)} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={13} /></button>
                )}
              </div>
              <select
                value={v.plataforma_id}
                onChange={e => setVinculo(i, { plataforma_id: e.target.value, external_id: '', nickname: null, status: 'idle' })}
                className={inputCls}
              >
                <option value="">{t('agente_modal.selecione_plataforma')}</option>
                {plataformasDisponiveis(v.plataforma_id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <Fld label={t('agente_modal.id_plataforma_label')} required>
                  <div className="relative">
                    <input
                      type="text"
                      value={v.external_id}
                      onChange={e => { setVinculo(i, { external_id: e.target.value }); buscar(i, v.plataforma_id, e.target.value) }}
                      placeholder={t('agente_modal.id_placeholder')}
                      disabled={!v.plataforma_id}
                      className={inputCls}
                    />
                    {v.searching && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
                  </div>
                </Fld>
                <Fld label={t('agente_modal.nickname_label')}>
                  <input
                    type="text"
                    value={v.nickname ?? ''}
                    onChange={e => setVinculo(i, { nickname: e.target.value || null })}
                    placeholder={t('agente_modal.nickname_placeholder')}
                    disabled={v.status === 'found_agente' || v.status === 'found_import'}
                    className={(v.status === 'found_agente' || v.status === 'found_import') ? inputLockedCls : inputCls}
                  />
                </Fld>
              </div>
              {v.status === 'found_import' && (
                <p className="text-xs text-gold/80">{t('agente_modal.found_import_desc', { nickname: v.nickname ?? '' })}</p>
              )}
              {v.status === 'not_found' && (
                <p className="text-xs text-gray-500">{t('agente_modal.not_found_desc')}</p>
              )}
              {v.status === 'conflict' && (
                <p className="text-xs text-alert flex items-center gap-1.5"><AlertTriangle size={12} />{t('agente_modal.conflict_desc', { nome: v.conflictNome ?? '' })}</p>
              )}
            </div>
          ))}
          <button type="button" onClick={addVinculo} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:border-gold/50 hover:text-white transition-all">
            <Plus size={12} />{t('agente_modal.add_plataforma')}
          </button>
        </>
      )}

      {step === 'clubes' && (
        <>
          <p className="text-xs text-gray-500">{t('agente_modal.clubes_desc')}</p>
          <div className="relative">
            <input
              type="text" value={buscaClube} onChange={e => setBuscaClube(e.target.value)}
              placeholder={t('agente_modal.buscar_clube_placeholder')} className={inputCls}
            />
            {buscandoClube && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
            {resultadosClube.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-surface2 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                {resultadosClube.map(c => (
                  <button
                    key={c.id} type="button" onClick={() => addClube(c)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                  >
                    {c.name} <span className="text-gray-500">({c.external_id ?? t('agente_modal.sem_id')})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {clubesSelecionados.map(c => {
            const v = vinculos.find(x => x.plataforma_id === c.plataforma_id && x.external_id)
            const plataformaNome = plataformas.find(p => p.id === c.plataforma_id)?.nome ?? t('agente_modal.sem_plataforma')
            return (
              <div key={c.id} className="p-3 rounded-lg border border-white/10 bg-surface2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white font-medium">{c.name}</span>
                  <button type="button" onClick={() => removeClube(c.id)} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={13} /></button>
                </div>
                <p className="text-xs text-gray-500">{t('agente_modal.liga_plataforma_line', { liga: c.leagueName ?? t('agente_modal.sem_liga'), plataforma: plataformaNome })}</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">{t('agente_modal.rakeback_nesse_clube')}</label>
                  <input
                    type="number" step="any" placeholder="0"
                    value={c.rakeback_pct ?? ''}
                    onChange={e => setClubesSelecionados(prev => prev.map(x => x.id === c.id ? { ...x, rakeback_pct: e.target.value === '' ? null : Number(e.target.value) } : x))}
                    className="w-20 bg-surface border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-gold/50"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
                {v ? (
                  <p className="text-xs text-gold/80">{t('agente_modal.id_agente_nesse_clube', { id: v.external_id, nickname: v.nickname ? `(${v.nickname})` : '' })}</p>
                ) : (
                  <p className="text-xs text-alert flex items-center gap-1.5">
                    <AlertTriangle size={12} />{t('agente_modal.cadastre_id_desc', { plataforma: plataformaNome })}
                  </p>
                )}
              </div>
            )
          })}
        </>
      )}

      {step === 'rakeback' && (
        <>
          <p className="text-xs text-gray-500">{t('agente_modal.rakeback_step_desc')}</p>
          <RegrasAplicadas entidadeTipo="agente" entidadeId={editing?.id ?? null} />
        </>
      )}
    </StepModal>
  )
}

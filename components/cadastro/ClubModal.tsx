'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Loader2, ChevronDown, ChevronUp, Plus, Trash2, Search } from 'lucide-react'
import type { Club, ClubForm, League, Plataforma } from '@/lib/types'
import { MOEDAS } from '@/lib/moedas'
import { formatIndicadorNome } from '@/lib/indicadores'
import { supabase } from '@/lib/supabase'

interface Condicao {
  indicador_ids: string[]
  operador: string
  valor: number | null
  resultado_pct: number | null
  is_fallback: boolean
}

interface Indicador { id: string; nome: string; descricao: string | null }

interface Props {
  open: boolean
  editing: Club | null
  leagues: League[]
  plataformas: Plataforma[]
  onClose: () => void
  onSave: (form: ClubForm, condicoes: Condicao[]) => void
  saving: boolean
}

const EMPTY: ClubForm = {
  league_id: null, name: '', external_id: null, settlement_type: 'dinamico', moeda: 'BRL',
  taxa_tipo: 'fixa', fee_mtt_pct: null, fee_cash_pct: null, taxa_op_pct: 9, taxa_op_tipo: 'fixa',
  spinup_pct: null, rebate_pct: null, crypto_rebate_pct: null, rakeback_pct: null, security: null,
  taxa_variavel_nome: null, taxa_variavel_indicador: null, taxa_variavel_regra: null,
  caucao_atual: null, stoploss_inicial: null,
  plataforma_id: null, operador_ext_id: null, operador_nickname: null, rebate_ativo: false,
}

const EMPTY_COND: Condicao = { indicador_ids: [''], operador: '>', valor: null, resultado_pct: null, is_fallback: false }

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'
const inputLockedCls = 'w-full bg-surface/50 border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-sm cursor-not-allowed'

type CondicaoRow = {
  operador: string
  valor: number | null
  resultado_pct: number | null
  is_fallback: boolean
  indicador_id?: string | null
  regra_condicao_termos?: { indicador_id: string; ordem: number }[]
}

function mapCondicao(c: CondicaoRow): Condicao {
  const termos = (c.regra_condicao_termos ?? []).slice().sort((a, b) => a.ordem - b.ordem)
  return {
    indicador_ids: termos.length > 0 ? termos.map((t) => t.indicador_id) : [c.indicador_id ?? ''],
    operador: c.operador,
    valor: c.valor,
    resultado_pct: c.resultado_pct,
    is_fallback: c.is_fallback,
  }
}

function toForm(c: Club): ClubForm {
  return {
    league_id: c.league_id, name: c.name, external_id: c.external_id, settlement_type: c.settlement_type,
    moeda: c.moeda, taxa_tipo: c.taxa_tipo, fee_mtt_pct: c.fee_mtt_pct, fee_cash_pct: c.fee_cash_pct,
    taxa_op_pct: c.taxa_op_pct, taxa_op_tipo: c.taxa_op_tipo, spinup_pct: c.spinup_pct, rebate_pct: c.rebate_pct,
    crypto_rebate_pct: c.crypto_rebate_pct, rakeback_pct: c.rakeback_pct, security: c.security,
    taxa_variavel_nome: c.taxa_variavel_nome, taxa_variavel_indicador: c.taxa_variavel_indicador,
    taxa_variavel_regra: c.taxa_variavel_regra, caucao_atual: c.caucao_atual, stoploss_inicial: c.stoploss_inicial,
    plataforma_id: c.plataforma_id ?? null,
    operador_ext_id: c.operador_ext_id ?? null,
    operador_nickname: c.operador_nickname ?? null,
    rebate_ativo: c.rebate_ativo ?? false,
  }
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-3">{title && <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">{title}</h3>}{children}</div>
}
function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-300 mb-1.5">{label}{required && <span className="text-gold ml-1">*</span>}</label>{children}</div>
}
function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return <input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} placeholder={placeholder} className={inputCls} />
}

export function ClubModal({ open, editing, leagues, plataformas, onClose, onSave, saving }: Props) {
  const [form, setForm] = useState<ClubForm>(EMPTY)
  const [adv, setAdv] = useState(false)
  const [indicacoes, setIndicacoes] = useState<{ club_id: string; taxa: string }[]>([])
  const [indClub, setIndClub] = useState('')
  const [indTaxa, setIndTaxa] = useState('')
  const [condicoes, setCondicoes] = useState<Condicao[]>([])
  const [indicadores, setIndicadores] = useState<Indicador[]>([])

  const [clubeLocked, setClubeLocked] = useState(false)
  const [searchingClube, setSearchingClube] = useState(false)
  const [clubeNaoEncontrado, setClubeNaoEncontrado] = useState(false)
  const [usuarioLocked, setUsuarioLocked] = useState(false)
  const [searchingUsuario, setSearchingUsuario] = useState(false)
  const [usuarioNaoEncontrado, setUsuarioNaoEncontrado] = useState(false)

  const [ligaRegraLeitura, setLigaRegraLeitura] = useState<{ nome: string; condicoes: Condicao[] } | null>(null)
  const clubeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const usuarioTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      supabase.from('indicadores').select('*').order('nome').then(({ data }) => { if (data) setIndicadores(data) })
    }
  }, [open])

  useEffect(() => {
    setForm(editing ? toForm(editing) : EMPTY)
    setAdv(false)
    setIndicacoes([])
    setIndClub('')
    setIndTaxa('')
    setClubeLocked(!!editing?.name && !!editing?.external_id)
    setUsuarioLocked(!!editing?.operador_nickname)
    setLigaRegraLeitura(null)

    if (editing) {
      supabase.from('regra_entidades')
        .select('regra_id, regras(id, nome, moeda, conversao_dia, regra_condicoes(*, regra_condicao_termos(indicador_id, ordem)))')
        .eq('entidade_tipo', 'clube')
        .eq('entidade_id', editing.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.regras) {
            const r = data.regras as any
            setCondicoes((r.regra_condicoes ?? []).map((c: CondicaoRow) => mapCondicao(c)))
          } else setCondicoes([])
        })
    } else {
      setCondicoes([])
    }
  }, [editing, open])

  useEffect(() => {
    if (!form.league_id) { setLigaRegraLeitura(null); return }
    const liga = leagues.find(l => l.id === form.league_id)
    if (!liga) { setLigaRegraLeitura(null); return }
    supabase.from('regra_entidades')
      .select('regra_id, regras(id, nome, regra_condicoes(*, regra_condicao_termos(indicador_id, ordem)))')
      .eq('entidade_tipo', 'liga')
      .eq('entidade_id', form.league_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.regras) {
          const r = data.regras as any
          setLigaRegraLeitura({
            nome: liga.name,
            condicoes: (r.regra_condicoes ?? []).map((c: CondicaoRow) => mapCondicao(c)),
          })
        } else {
          setLigaRegraLeitura({ nome: liga.name, condicoes: [] })
        }
      })
  }, [form.league_id, leagues])

  if (!open) return null

  const set = (k: keyof ClubForm, v: any) => setForm(f => ({ ...f, [k]: v }))
  const isDin = form.settlement_type === 'dinamico'
  const isUSD = form.settlement_type === 'weekly_usd'
  const isRkb = form.settlement_type === 'rakeback'
  const isVar = form.taxa_tipo === 'variavel'
  // Liga só conta como "tem liga" quando é uma string não vazia
  const temLiga = !!form.league_id && form.league_id !== ''

  const handleClubeIdChange = (v: string) => {
    set('external_id', v || null)
    set('name', '')
    setClubeLocked(false)
    setClubeNaoEncontrado(false)
    if (clubeTimer.current) clearTimeout(clubeTimer.current)
    if (!v.trim()) return
    clubeTimer.current = setTimeout(async () => {
      setSearchingClube(true)
      try {
        const { data } = await supabase.from('clubs').select('name').eq('external_id', v.trim()).maybeSingle()
        if (data?.name) {
          set('name', data.name); setClubeLocked(true); setClubeNaoEncontrado(false)
        } else {
          setClubeNaoEncontrado(true)
        }
      } finally {
        setSearchingClube(false)
      }
    }, 500)
  }

  const handleUsuarioIdChange = (v: string) => {
    set('operador_ext_id', v || null)
    set('operador_nickname', null)
    setUsuarioLocked(false)
    setUsuarioNaoEncontrado(false)
    if (usuarioTimer.current) clearTimeout(usuarioTimer.current)
    if (!v.trim()) return
    usuarioTimer.current = setTimeout(async () => {
      setSearchingUsuario(true)
      try {
        const [agente, jogador, liga] = await Promise.all([
          supabase.from('agentes').select('nome').eq('external_id', v.trim()).maybeSingle(),
          supabase.from('jogadores').select('nome').eq('external_id', v.trim()).maybeSingle(),
          supabase.from('leagues').select('name').eq('clube_ext_id', v.trim()).maybeSingle(),
        ])
        const found = agente.data?.nome || jogador.data?.nome || liga.data?.name
        if (found) {
          set('operador_nickname', found); setUsuarioLocked(true); setUsuarioNaoEncontrado(false)
        } else {
          setUsuarioNaoEncontrado(true)
        }
      } finally {
        setSearchingUsuario(false)
      }
    }, 500)
  }

  const addCondicao = () => setCondicoes(c => [...c, { ...EMPTY_COND }])
  const addFallback = () => { if (condicoes.some(c => c.is_fallback)) return; setCondicoes(c => [...c, { ...EMPTY_COND, is_fallback: true, operador: '>=' }]) }
  const removeCondicao = (i: number) => setCondicoes(c => c.filter((_, j) => j !== i))
  const setCondicao = (i: number, k: keyof Condicao, v: any) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, [k]: v } : item))
  const setTermo = (i: number, ti: number, v: string) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: item.indicador_ids.map((id, tj) => tj === ti ? v : id) } : item))
  const addTermo = (i: number) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: [...item.indicador_ids, ''] } : item))
  const removeTermo = (i: number, ti: number) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: item.indicador_ids.filter((_, tj) => tj !== ti) } : item))
  const nomeIndicador = (id: string) => {
    const ind = indicadores.find(x => x.id === id)
    return ind ? formatIndicadorNome(ind.nome, ind.descricao) : '?'
  }

  // Bloco reutilizável da Fórmula de Ajuste (SE/ENTÃO)
  const formulaAjuste = (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Fórmula de Ajuste — Condições SE / ENTÃO</p>
      {temLiga ? (
        <div className="p-4 bg-surface2 rounded-lg border border-white/10 space-y-2">
          <p className="text-xs text-gray-400">
            Este clube está atrelado à liga <span className="text-gold font-medium">{ligaRegraLeitura?.nome}</span>.
            A regra de ajuste é herdada dela:
          </p>
          {ligaRegraLeitura && ligaRegraLeitura.condicoes.length > 0 ? (
            <div className="space-y-1.5 mt-2">
              {ligaRegraLeitura.condicoes.map((c, i) => (
                <div key={i} className="text-xs text-gray-400 bg-surface px-3 py-2 rounded border border-white/5">
                  {c.is_fallback
                    ? <>SENÃO → <span className="text-gold">{c.resultado_pct}%</span></>
                    : <>SE {c.indicador_ids.map(nomeIndicador).join(' + ')} {c.operador} {c.valor} → <span className="text-gold">{c.resultado_pct}%</span></>
                  }
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">A liga ainda não possui regra configurada.</p>
          )}
        </div>
      ) : (
        <>
          {condicoes.map((c, i) => (
            <div key={i} className={`p-3 rounded-lg border space-y-2 ${c.is_fallback ? 'border-gold/30 bg-gold/5' : 'border-white/10 bg-surface2'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">{c.is_fallback ? 'SENÃO' : `SE ${i + 1}`}</span>
                <button type="button" onClick={() => removeCondicao(i)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
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
                          <button type="button" onClick={() => removeTermo(i, ti)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
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
        </>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Clube' : 'Novo Clube'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form, condicoes) }} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            <Sec title="Identificação">
              <div className="grid grid-cols-2 gap-4">
                <Fld label="Moeda">
                  <select value={form.moeda ?? 'BRL'} onChange={e => set('moeda', e.target.value)} className={inputCls}>
                    {MOEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Fld>
                <Fld label="Liga (opcional)">
                  <select value={form.league_id ?? ''} onChange={e => set('league_id', e.target.value || null)} className={inputCls}>
                    <option value="">— Nenhuma —</option>
                    {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Fld>
              </div>
            </Sec>

            <Sec title="Usuário na Plataforma">
              <p className="text-xs text-gray-500">Cada plataforma é um clube diferente. IDs já cadastrados são preenchidos automaticamente.</p>
              <Fld label="Plataforma (App)">
                <select value={form.plataforma_id ?? ''} onChange={e => set('plataforma_id', e.target.value || null)} className={inputCls}>
                  <option value="">— Selecione —</option>
                  {plataformas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Fld>
              <div className="grid grid-cols-2 gap-3">
                <Fld label="ID do Clube" required>
                  <div className="relative">
                    <input type="text" value={form.external_id ?? ''} onChange={e => handleClubeIdChange(e.target.value)} placeholder="Ex: 1548056" className={inputCls} />
                    {searchingClube && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
                  </div>
                </Fld>
                <Fld label="Nome do Clube" required>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => { set('name', e.target.value); setClubeLocked(false) }}
                    placeholder="Preenchido automaticamente"
                    disabled={clubeLocked}
                    className={clubeLocked ? inputLockedCls : inputCls}
                  />
                  {clubeNaoEncontrado && !clubeLocked && (
                    <p className="text-xs text-gold/80 mt-1.5">⚠ Clube não encontrado. Preencha o nome para cadastrá-lo.</p>
                  )}
                </Fld>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Fld label="ID do Usuário">
                  <div className="relative">
                    <input type="text" value={form.operador_ext_id ?? ''} onChange={e => handleUsuarioIdChange(e.target.value)} placeholder="Ex: 12034210" className={inputCls} />
                    {searchingUsuario && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
                  </div>
                </Fld>
                <Fld label="Nome do Usuário">
                  <input
                    type="text"
                    value={form.operador_nickname ?? ''}
                    onChange={e => { set('operador_nickname', e.target.value || null); setUsuarioLocked(false) }}
                    placeholder="Preenchido automaticamente"
                    disabled={usuarioLocked}
                    className={usuarioLocked ? inputLockedCls : inputCls}
                  />
                  {usuarioNaoEncontrado && !usuarioLocked && (
                    <p className="text-xs text-gold/80 mt-1.5">⚠ Usuário não encontrado. Preencha o nome para cadastrá-lo.</p>
                  )}
                </Fld>
              </div>
            </Sec>

            <Sec title="Taxas">
              {!isRkb && (
                <Fld label="Tipo de Taxa">
                  <div className="flex gap-3">
                    {['fixa', 'variavel'].map(t => (
                      <button key={t} type="button" onClick={() => set('taxa_tipo', t)} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${form.taxa_tipo === t ? 'border-gold bg-gold/10 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                        {t === 'fixa' ? 'Fixa' : 'Variável'}
                      </button>
                    ))}
                  </div>
                </Fld>
              )}
              {!isRkb && !isVar && (
                <div className="grid grid-cols-2 gap-4">
                  <Fld label="Fee MTT (%)"><NumInput value={form.fee_mtt_pct} onChange={v => set('fee_mtt_pct', v)} placeholder="Ex: 8.5" /></Fld>
                  {isDin && <Fld label="Fee Cash (%)"><NumInput value={form.fee_cash_pct} onChange={v => set('fee_cash_pct', v)} placeholder="Ex: 8.5" /></Fld>}
                </div>
              )}
              {isVar && !isRkb && (
                <div className="space-y-3 p-4 bg-surface2 rounded-lg border border-white/10">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Taxa Variável</p>
                  <Fld label="Nome"><input type="text" value={form.taxa_variavel_nome ?? ''} onChange={e => set('taxa_variavel_nome', e.target.value || null)} placeholder="Ex: 5%-15%" className={inputCls} /></Fld>
                  <Fld label="Indicador">
                    <select value={form.taxa_variavel_indicador ?? ''} onChange={e => set('taxa_variavel_indicador', e.target.value || null)} className={inputCls}>
                      <option value="">Selecione</option>
                      {['Rake', 'Ganhos+Rake', 'WTR', 'Rake Cash', 'Rake MTT'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Fld>
                  {formulaAjuste}
                </div>
              )}
              {isRkb && <Fld label="Rakeback (%)"><NumInput value={form.rakeback_pct} onChange={v => set('rakeback_pct', v)} placeholder="Ex: 72" /></Fld>}

              <div className="grid grid-cols-2 gap-4">
                <Fld label="Taxa Operacional"><NumInput value={form.taxa_op_pct} onChange={v => set('taxa_op_pct', v)} placeholder="Ex: 9" /></Fld>
                {isDin && <Fld label="SpinUp (%)"><NumInput value={form.spinup_pct} onChange={v => set('spinup_pct', v)} placeholder="Ex: 3" /></Fld>}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer w-fit">
                  <div
                    onClick={() => { const novo = !form.rebate_ativo; set('rebate_ativo', novo); if (!novo) set('rebate_pct', null) }}
                    className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${form.rebate_ativo ? 'bg-gold' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.rebate_ativo ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-sm text-gray-300">Rebate</span>
                </label>
                {form.rebate_ativo && (
                  <Fld label="Valor do Rebate (%)"><NumInput value={form.rebate_pct} onChange={v => set('rebate_pct', v)} placeholder="Ex: 10" /></Fld>
                )}
              </div>

              {!isRkb && isUSD && (
                <Fld label="Crypto Rebate (%)"><NumInput value={form.crypto_rebate_pct} onChange={v => set('crypto_rebate_pct', v)} placeholder="Ex: 5" /></Fld>
              )}
            </Sec>

            {/* Fórmula de Ajuste — só exibida aqui fora se NÃO for taxa variável (pois já apareceu lá dentro) */}
            {!isVar && (
              <Sec title="Fórmula de Ajuste">
                {formulaAjuste}
              </Sec>
            )}

            <div>
              <button type="button" onClick={() => setAdv(v => !v)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors w-full">
                {adv ? <ChevronUp size={16} /> : <ChevronDown size={16} />}Garantias & Limites
              </button>
              {adv && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Fld label="Caução Atual"><NumInput value={form.caucao_atual} onChange={v => set('caucao_atual', v)} placeholder="Ex: 1000" /></Fld>
                  <Fld label="Stoploss Inicial"><NumInput value={form.stoploss_inicial} onChange={v => set('stoploss_inicial', v)} placeholder="Ex: 5000" /></Fld>
                </div>
              )}

              {!temLiga ? (
                <div className="space-y-3 mt-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">Indicações</h3>
                  <div className="flex gap-2">
                    <input type="text" value={indClub} onChange={e => setIndClub(e.target.value)} placeholder="ID do clube indicado" className="flex-1 bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50" />
                    <input type="number" step="any" value={indTaxa} onChange={e => setIndTaxa(e.target.value)} placeholder="Taxa %" className="w-24 bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50" />
                    <button type="button" onClick={() => { if (!indClub || !indTaxa) return; setIndicacoes(p => [...p, { club_id: indClub, taxa: indTaxa }]); setIndClub(""); setIndTaxa(""); }} className="px-3 py-2 bg-surface2 border border-white/10 rounded-lg text-gold hover:border-gold/50 transition-colors"><Plus size={16} /></button>
                  </div>
                  {indicacoes.map((ind, i) => <div key={i} className="flex items-center justify-between p-2 bg-surface rounded-lg border border-white/10 text-sm"><span className="text-gray-300">{ind.club_id}</span><span className="text-gold">{ind.taxa}%</span><button type="button" onClick={() => setIndicacoes(p => p.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400"><Trash2 size={13} /></button></div>)}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic mt-4">Indicações ficam disponíveis apenas para clubes sem liga vinculada.</p>
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar Clube
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
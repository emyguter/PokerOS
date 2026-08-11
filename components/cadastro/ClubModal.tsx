'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Search } from 'lucide-react'
import type { Club, ClubForm, League, Plataforma } from '@/lib/types'
import { MOEDAS } from '@/lib/moedas'
import { supabase } from '@/lib/supabase'
import { RegrasAplicadas } from './RegrasAplicadas'
import { StepModal, type ModalStep } from './StepModal'

interface Props {
  open: boolean
  editing: Club | null
  leagues: League[]
  plataformas: Plataforma[]
  onClose: () => void
  onSave: (form: ClubForm) => void
  saving: boolean
  error?: string | null
}

const EMPTY: ClubForm = {
  league_id: null, name: '', external_id: null, settlement_type: 'dinamico', moeda: 'BRL',
  taxa_tipo: 'fixa', fee_mtt_pct: null, fee_cash_pct: null, taxa_op_pct: 9, taxa_op_tipo: 'fixa',
  spinup_pct: null, rebate_pct: null, crypto_rebate_pct: null, rakeback_pct: null, security: null,
  taxa_variavel_nome: null, taxa_variavel_indicador: null, taxa_variavel_regra: null,
  caucao_atual: null, stoploss_inicial: null, ratio_caucao_stoploss: null,
  plataforma_id: null, operador_ext_id: null, operador_nickname: null, rebate_ativo: false,
}

const STEPS: ModalStep[] = [
  { key: 'identificacao', label: 'Identificação' },
  { key: 'plataforma', label: 'Plataforma' },
  { key: 'taxas', label: 'Taxas' },
  { key: 'regras', label: 'Regras' },
  { key: 'garantias', label: 'Garantias & Limites' },
]

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'
const inputLockedCls = 'w-full bg-surface/50 border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-sm cursor-not-allowed'

function toForm(c: Club): ClubForm {
  return {
    league_id: c.league_id, name: c.name, external_id: c.external_id, settlement_type: c.settlement_type,
    moeda: c.moeda, taxa_tipo: c.taxa_tipo, fee_mtt_pct: c.fee_mtt_pct, fee_cash_pct: c.fee_cash_pct,
    taxa_op_pct: c.taxa_op_pct, taxa_op_tipo: c.taxa_op_tipo, spinup_pct: c.spinup_pct, rebate_pct: c.rebate_pct,
    crypto_rebate_pct: c.crypto_rebate_pct, rakeback_pct: c.rakeback_pct, security: c.security,
    taxa_variavel_nome: c.taxa_variavel_nome, taxa_variavel_indicador: c.taxa_variavel_indicador,
    taxa_variavel_regra: c.taxa_variavel_regra, caucao_atual: c.caucao_atual, stoploss_inicial: c.stoploss_inicial,
    ratio_caucao_stoploss: c.ratio_caucao_stoploss,
    plataforma_id: c.plataforma_id ?? null,
    operador_ext_id: c.operador_ext_id ?? null,
    operador_nickname: c.operador_nickname ?? null,
    rebate_ativo: c.rebate_ativo ?? false,
  }
}

function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-300 mb-1.5">{label}{required && <span className="text-gray-500 ml-1">*</span>}</label>{children}</div>
}
function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return <input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} placeholder={placeholder} className={inputCls} />
}

export function ClubModal({ open, editing, leagues, plataformas, onClose, onSave, saving, error }: Props) {
  const [form, setForm] = useState<ClubForm>(EMPTY)
  const [step, setStep] = useState('identificacao')
  const [indicacoes, setIndicacoes] = useState<{ club_id: string; club_nome: string; taxa: string }[]>([])
  const [indClub, setIndClub] = useState<{ id: string; nome: string } | null>(null)
  const [indTaxa, setIndTaxa] = useState('')
  const [buscaIndClub, setBuscaIndClub] = useState('')
  const [resultadosIndClub, setResultadosIndClub] = useState<{ id: string; name: string; external_id: string | null; plataformaNome: string | null }[]>([])
  const [buscandoIndClub, setBuscandoIndClub] = useState(false)
  const indClubTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [clubeLocked, setClubeLocked] = useState(false)
  const [searchingClube, setSearchingClube] = useState(false)
  const [clubeNaoEncontrado, setClubeNaoEncontrado] = useState(false)

  const clubeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setForm(editing ? toForm(editing) : EMPTY)
    setStep('identificacao')
    setIndicacoes([])
    setIndClub(null)
    setIndTaxa('')
    setBuscaIndClub('')
    setResultadosIndClub([])
    setClubeLocked(!!editing?.name && !!editing?.external_id)
  }, [editing, open])

  useEffect(() => {
    if (indClubTimer.current) clearTimeout(indClubTimer.current)
    if (!buscaIndClub.trim()) { setResultadosIndClub([]); return }
    indClubTimer.current = setTimeout(async () => {
      setBuscandoIndClub(true)
      try {
        const q = buscaIndClub.trim()
        let query = supabase
          .from('clubs')
          .select('id, name, external_id, plataformas(nome)')
          .or(`name.ilike.%${q}%,external_id.ilike.%${q}%`)
          .limit(6)
        if (editing) query = query.neq('id', editing.id)
        const { data } = await query
        setResultadosIndClub((data ?? []).map((c: any) => ({
          id: c.id, name: c.name, external_id: c.external_id, plataformaNome: c.plataformas?.nome ?? null,
        })))
      } finally {
        setBuscandoIndClub(false)
      }
    }, 400)
  }, [buscaIndClub, editing])

  if (!open) return null

  const set = (k: keyof ClubForm, v: any) => setForm(f => ({ ...f, [k]: v }))
  const isDin = form.settlement_type === 'dinamico'
  const isUSD = form.settlement_type === 'weekly_usd'
  const isRkb = form.settlement_type === 'rakeback'
  // Stoploss Inicial só pode ser definido uma vez — depois disso o campo trava.
  const stoplossTravado = editing?.stoploss_inicial != null

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

  return (
    <StepModal
      open={open}
      title={editing ? 'Editar Clube' : 'Novo Clube'}
      steps={STEPS}
      active={step}
      onStepChange={setStep}
      onClose={onClose}
      onSubmit={e => { e.preventDefault(); onSave(form) }}
      saving={saving}
      error={error}
      submitLabel="Salvar Clube"
    >
      {step === 'identificacao' && (
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
      )}

      {step === 'plataforma' && (
        <>
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
        </>
      )}

      {step === 'taxas' && (
        <>
          {!isRkb && (
            <div className="grid grid-cols-2 gap-4">
              <Fld label="Fee MTT (%)"><NumInput value={form.fee_mtt_pct} onChange={v => set('fee_mtt_pct', v)} placeholder="Ex: 8.5" /></Fld>
              {isDin && <Fld label="Fee Cash (%)"><NumInput value={form.fee_cash_pct} onChange={v => set('fee_cash_pct', v)} placeholder="Ex: 8.5" /></Fld>}
            </div>
          )}
          {isRkb && <Fld label="Rakeback (%)"><NumInput value={form.rakeback_pct} onChange={v => set('rakeback_pct', v)} placeholder="Ex: 72" /></Fld>}

          <div className="grid grid-cols-2 gap-4">
            <Fld label="Taxa Operacional"><NumInput value={form.taxa_op_pct} onChange={v => set('taxa_op_pct', v)} placeholder="Ex: 9" /></Fld>
            {isDin && <Fld label="SpinUp (%)"><NumInput value={form.spinup_pct} onChange={v => set('spinup_pct', v)} placeholder="Ex: 3" /></Fld>}
          </div>
          {!isRkb && isDin && (
            <p className="text-xs text-gray-500">
              Fee MTT, Fee Cash, Taxa Operacional e SpinUp acima só valem pro campo que <strong>não</strong> tiver regra variável vinculada — se tiver, a faixa SE/ENTÃO da regra manda pra aquele campo específico. Confira na etapa "Regras".
            </p>
          )}

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
        </>
      )}

      {step === 'regras' && (
        <RegrasAplicadas entidadeTipo="clube" entidadeId={editing?.id ?? null} />
      )}

      {step === 'garantias' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Fld label="Caução Atual"><NumInput value={form.caucao_atual} onChange={v => set('caucao_atual', v)} placeholder="Ex: 1000" /></Fld>
            <Fld label="Stoploss Inicial">
              {stoplossTravado ? (
                <input type="text" value={form.stoploss_inicial ?? ''} disabled className={inputLockedCls} />
              ) : (
                <NumInput value={form.stoploss_inicial} onChange={v => set('stoploss_inicial', v)} placeholder="Ex: 5000" />
              )}
              {stoplossTravado && <p className="text-xs text-gray-500 mt-1.5">Travado depois de definido — o histórico do clube parte daqui.</p>}
            </Fld>
            {editing?.stoploss_atual != null && (
              <div className="col-span-2 text-sm text-gray-400">Stoploss Atual: <span className="text-gold font-medium">{editing.stoploss_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> <span className="text-xs text-gray-600">(ajustado na tela de Controle de Stoploss)</span></div>
            )}
            <Fld label="Ratio Caução → Stoploss">
              <NumInput value={form.ratio_caucao_stoploss} onChange={v => set('ratio_caucao_stoploss', v)} placeholder="Ex: 2" />
              <p className="text-xs text-gray-500 mt-1.5">Quanto soma no Stoploss pra cada real de Caução confirmada. Ex: 2 = ratio 1:2 (R$1 de caução vira R$2 de Stoploss). Vazio = ratio 1:1 (R$1 de caução vira R$1 de Stoploss).</p>
            </Fld>
          </div>

          <div className="space-y-3 mt-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">Indicações</h3>
            {indClub ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-between px-3 py-2 bg-surface2 border border-gold/30 rounded-lg text-sm">
                  <span className="text-white">{indClub.nome}</span>
                  <button type="button" onClick={() => setIndClub(null)} className="text-gray-500 hover:text-alert"><Trash2 size={13} /></button>
                </div>
                <input type="number" step="any" value={indTaxa} onChange={e => setIndTaxa(e.target.value)} placeholder="Taxa %" className="w-24 bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50" />
                <button
                  type="button"
                  onClick={() => { if (!indClub || !indTaxa) return; setIndicacoes(p => [...p, { club_id: indClub.id, club_nome: indClub.nome, taxa: indTaxa }]); setIndClub(null); setIndTaxa(''); setBuscaIndClub('') }}
                  className="px-3 py-2 bg-surface2 border border-white/10 rounded-lg text-gold hover:border-gold/50 transition-colors"
                ><Plus size={16} /></button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text" value={buscaIndClub} onChange={e => setBuscaIndClub(e.target.value)}
                  placeholder="Buscar clube por ID ou nome..." className={inputCls}
                />
                {buscandoIndClub && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
                {resultadosIndClub.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-surface2 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                    {resultadosIndClub.map(c => (
                      <button
                        key={c.id} type="button"
                        onClick={() => { setIndClub({ id: c.id, nome: c.name }); setBuscaIndClub(''); setResultadosIndClub([]) }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors"
                      >
                        {c.name} <span className="text-gray-500">(ID: {c.external_id ?? '—'}{c.plataformaNome ? ` · ${c.plataformaNome}` : ''})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {indicacoes.map((ind, i) => <div key={i} className="flex items-center justify-between p-2 bg-surface rounded-lg border border-white/10 text-sm"><span className="text-gray-300">{ind.club_nome}</span><span className="text-gold">{ind.taxa}%</span><button type="button" onClick={() => setIndicacoes(p => p.filter((_, j) => j !== i))} className="text-gray-500 hover:text-alert"><Trash2 size={13} /></button></div>)}
          </div>
        </>
      )}
    </StepModal>
  )
}

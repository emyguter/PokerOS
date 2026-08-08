'use client'
import { useState, useEffect, useRef } from 'react'
import { Loader2, Search, AlertTriangle, Building2 } from 'lucide-react'
import type { Jogador, JogadorForm, Plataforma } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { StepModal, type ModalStep } from './StepModal'

interface Props {
  open: boolean
  editing: Jogador | null
  plataformas: Plataforma[]
  onClose: () => void
  onSave: (form: JogadorForm) => void
  saving: boolean
  error?: string | null
}

const EMPTY: JogadorForm = { nome: '', telefone: null, external_id: '', plataforma_id: null }

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'
const inputLockedCls = 'w-full bg-surface/50 border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-sm cursor-not-allowed'

function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-300 mb-1.5">{label}{required && <span className="text-gray-500 ml-1">*</span>}</label>{children}</div>
}

interface ClubeJogado { id: string; name: string; external_id: string | null }

export function JogadorModal({ open, editing, plataformas, onClose, onSave, saving, error }: Props) {
  const [form, setForm] = useState<JogadorForm>(EMPTY)
  const [step, setStep] = useState('plataforma')
  const [nomeLocked, setNomeLocked] = useState(false)
  const [searching, setSearching] = useState(false)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [conflito, setConflito] = useState<{ id: string; nome: string } | null>(null)
  const [clubesJogados, setClubesJogados] = useState<ClubeJogado[]>([])
  const [carregandoClubes, setCarregandoClubes] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setForm(editing ? { nome: editing.nome, telefone: editing.telefone, external_id: editing.external_id, plataforma_id: editing.plataforma_id } : EMPTY)
    setStep('plataforma')
    setNomeLocked(!!editing)
    setNaoEncontrado(false)
    setConflito(null)
  }, [editing, open])

  // Mostra os clubes do jogador sendo editado, ou do jogador conflitante (mesmo ID já cadastrado noutro jogador)
  const jogadorIdParaClubes = editing?.id ?? conflito?.id ?? null

  useEffect(() => {
    if (!open || !jogadorIdParaClubes) { setClubesJogados([]); return }
    setCarregandoClubes(true)
    supabase
      .from('clube_jogadores')
      .select('clubs(id, name, external_id)')
      .eq('jogador_id', jogadorIdParaClubes)
      .then(({ data }) => {
        setClubesJogados(
          (data ?? [])
            .map((cj) => (cj as unknown as { clubs: ClubeJogado | null }).clubs)
            .filter((c): c is ClubeJogado => !!c)
        )
        setCarregandoClubes(false)
      })
  }, [jogadorIdParaClubes, open])

  const STEPS: ModalStep[] = [
    { key: 'plataforma', label: 'Plataforma' },
    { key: 'identificacao', label: 'Identificação' },
    ...(jogadorIdParaClubes ? [{ key: 'clubes', label: 'Clubes' }] : []),
  ]

  if (!open) return null

  const set = (k: keyof JogadorForm, v: any) => setForm(f => ({ ...f, [k]: v }))

  const buscar = (externalId: string, plataformaId: string | null) => {
    if (timer.current) clearTimeout(timer.current)
    setNaoEncontrado(false); setConflito(null)
    if (!externalId.trim() || !plataformaId) return
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const { data } = await supabase
          .from('jogadores')
          .select('id, nome')
          .eq('plataforma_id', plataformaId)
          .eq('external_id', externalId.trim())
          .maybeSingle()

        if (data) {
          const ehOutroJogador = editing ? data.id !== editing.id : true
          if (ehOutroJogador) {
            setConflito({ id: data.id, nome: data.nome })
            setNomeLocked(false)
          } else {
            set('nome', data.nome)
            setNomeLocked(true)
          }
        } else {
          setNaoEncontrado(true)
          setNomeLocked(false)
        }
      } finally {
        setSearching(false)
      }
    }, 500)
  }

  const handleIdChange = (v: string) => {
    set('external_id', v)
    buscar(v, form.plataforma_id)
  }
  const handlePlataformaChange = (v: string) => {
    set('plataforma_id', v || null)
    buscar(form.external_id, v || null)
  }

  const podeSalvar = form.nome.trim().length > 0 && form.external_id.trim().length > 0 && !!form.plataforma_id && !conflito

  return (
    <StepModal
      open={open}
      title={editing ? 'Editar Jogador' : 'Novo Jogador'}
      steps={STEPS}
      active={step}
      onStepChange={setStep}
      onClose={onClose}
      onSubmit={e => { e.preventDefault(); if (podeSalvar) onSave(form) }}
      saving={saving}
      error={error}
      submitLabel="Salvar Jogador"
      maxWidth="max-w-lg"
    >
      {step === 'plataforma' && (
        <>
          <Fld label="Plataforma" required>
            <select value={form.plataforma_id ?? ''} onChange={e => handlePlataformaChange(e.target.value)} className={inputCls}>
              <option value="">— Selecione —</option>
              {plataformas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Fld>
          <Fld label="ID nessa plataforma" required>
            <div className="relative">
              <input
                type="text" value={form.external_id}
                onChange={e => handleIdChange(e.target.value)}
                placeholder="Ex: 12034210" disabled={!form.plataforma_id} className={inputCls}
              />
              {searching && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
            </div>
          </Fld>
        </>
      )}

      {step === 'identificacao' && (
        <>
          <Fld label="Nome" required>
            <input
              type="text" value={form.nome}
              onChange={e => { set('nome', e.target.value); setNomeLocked(false) }}
              placeholder="Preenchido automaticamente se já cadastrado"
              disabled={nomeLocked}
              className={nomeLocked ? inputLockedCls : inputCls}
            />
            {naoEncontrado && !nomeLocked && (
              <p className="text-xs text-gold/80 mt-1.5">⚠ Jogador novo nessa plataforma. Preencha o nome para cadastrar.</p>
            )}
            {conflito && (
              <p className="text-xs text-alert mt-1.5 flex items-center gap-1.5">
                <AlertTriangle size={12} />Esse ID já pertence a {conflito.nome}. Edite o jogador existente em vez de criar outro.
              </p>
            )}
          </Fld>
          <Fld label="Telefone">
            <input type="text" value={form.telefone ?? ''} onChange={e => set('telefone', e.target.value || null)} placeholder="opcional" className={inputCls} />
          </Fld>
        </>
      )}

      {step === 'clubes' && jogadorIdParaClubes && (
        <>
          <p className="text-xs text-gray-500">{conflito ? `Clubes onde ${conflito.nome} já jogou` : 'Clubes onde já jogou'}</p>
          {carregandoClubes ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={13} className="animate-spin" />Carregando...
            </div>
          ) : clubesJogados.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {clubesJogados.map(c => (
                <div
                  key={c.id}
                  className="group flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full bg-gradient-to-r from-gold/10 to-transparent border border-gold/20 hover:border-gold/50 transition-colors"
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gold/15 text-gold shrink-0">
                    <Building2 size={11} />
                  </span>
                  <span className="text-xs text-gray-200 font-medium">{c.name}</span>
                  {c.external_id && <span className="text-[10px] text-gray-500">#{c.external_id}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">Nenhum clube registrado ainda pra esse jogador.</p>
          )}
        </>
      )}
    </StepModal>
  )
}

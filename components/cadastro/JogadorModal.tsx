'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Search, AlertTriangle } from 'lucide-react'
import type { Jogador, JogadorForm, Plataforma } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface Props {
  open: boolean
  editing: Jogador | null
  plataformas: Plataforma[]
  onClose: () => void
  onSave: (form: JogadorForm) => void
  saving: boolean
}

const EMPTY: JogadorForm = { nome: '', telefone: null, external_id: '', plataforma_id: null }

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'
const inputLockedCls = 'w-full bg-surface/50 border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-sm cursor-not-allowed'

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-3">{title && <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">{title}</h3>}{children}</div>
}
function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-300 mb-1.5">{label}{required && <span className="text-gold ml-1">*</span>}</label>{children}</div>
}

export function JogadorModal({ open, editing, plataformas, onClose, onSave, saving }: Props) {
  const [form, setForm] = useState<JogadorForm>(EMPTY)
  const [nomeLocked, setNomeLocked] = useState(false)
  const [searching, setSearching] = useState(false)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [conflito, setConflito] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setForm(editing ? { nome: editing.nome, telefone: editing.telefone, external_id: editing.external_id, plataforma_id: editing.plataforma_id } : EMPTY)
    setNomeLocked(!!editing)
    setNaoEncontrado(false)
    setConflito(null)
  }, [editing, open])

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
            setConflito(data.nome)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Jogador' : 'Novo Jogador'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (podeSalvar) onSave(form) }} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            <Sec title="Plataforma">
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
            </Sec>

            <Sec title="Identificação">
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
                  <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle size={12} />Esse ID já pertence a {conflito}. Edite o jogador existente em vez de criar outro.
                  </p>
                )}
              </Fld>
              <Fld label="Telefone">
                <input type="text" value={form.telefone ?? ''} onChange={e => set('telefone', e.target.value || null)} placeholder="opcional" className={inputCls} />
              </Fld>
            </Sec>

          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving || !podeSalvar} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar Jogador
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
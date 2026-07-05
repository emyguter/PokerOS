'use client'
import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Trash2, Search } from 'lucide-react'
import type { Agente, AgenteForm } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface AgenteResultado { id: string; nome: string; email: string | null }

interface Props {
  open: boolean
  editing: Agente | null
  subAgentesIniciais: AgenteResultado[]
  onClose: () => void
  onSave: (form: AgenteForm, subAgenteIds: string[]) => void
  saving: boolean
}

const EMPTY: AgenteForm = { nome: '', email: null, telefone: null, superagente_id: null }
const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-3">{title && <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">{title}</h3>}{children}</div>
}
function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="block text-sm font-medium text-gray-300 mb-1.5">{label}{required && <span className="text-gold ml-1">*</span>}</label>{children}</div>
}

export function SuperAgenteModal({ open, editing, subAgentesIniciais, onClose, onSave, saving }: Props) {
  const [form, setForm] = useState<AgenteForm>(EMPTY)
  const [selecionados, setSelecionados] = useState<AgenteResultado[]>([])
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<AgenteResultado[]>([])
  const [buscando, setBuscando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setForm(editing ? { nome: editing.nome, email: editing.email, telefone: editing.telefone, superagente_id: null } : EMPTY)
    setSelecionados(subAgentesIniciais)
    setBusca(''); setResultados([])
  }, [editing, open, subAgentesIniciais])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!busca.trim()) { setResultados([]); return }
    timer.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const q = busca.trim()
        let query = supabase.from('agentes').select('id, nome, email').ilike('nome', `%${q}%`).limit(6)
        if (editing) query = query.neq('id', editing.id)
        const { data } = await query
        setResultados((data ?? []).filter(a => !selecionados.some(s => s.id === a.id)))
      } finally { setBuscando(false) }
    }, 400)
  }, [busca, editing, selecionados])

  if (!open) return null

  const set = (k: keyof AgenteForm, v: any) => setForm(f => ({ ...f, [k]: v }))
  const addAgente = (a: AgenteResultado) => { setSelecionados(prev => [...prev, a]); setBusca(''); setResultados([]) }
  const removeAgente = (id: string) => setSelecionados(prev => prev.filter(a => a.id !== id))
  const podeSalvar = form.nome.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Super Agente' : 'Novo Super Agente'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (podeSalvar) onSave(form, selecionados.map(a => a.id)) }} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            <Sec title="Identificação">
              <Fld label="Nome" required>
                <input type="text" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome do super agente" className={inputCls} />
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

            <Sec title="Agentes vinculados">
              <p className="text-xs text-gray-500">Busque e adicione os agentes que respondem a esse super agente.</p>
              <div className="relative">
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar agente por nome..." className={inputCls} />
                {buscando && <Search size={14} className="absolute right-3 top-3 text-gold animate-pulse" />}
                {resultados.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-surface2 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                    {resultados.map(a => (
                      <button key={a.id} type="button" onClick={() => addAgente(a)} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors">
                        {a.nome} {a.email && <span className="text-gray-500">({a.email})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selecionados.length === 0 && <p className="text-xs text-gray-600">Nenhum agente vinculado ainda.</p>}
              {selecionados.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface2">
                  <span className="text-sm text-white">{a.nome}</span>
                  <button type="button" onClick={() => removeAgente(a.id)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                </div>
              ))}
            </Sec>
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving || !podeSalvar} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar Super Agente
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
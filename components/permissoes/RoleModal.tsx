'use client'
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Permissao } from './PermissoesView'

interface Props {
  open: boolean
  editing: { id: string; nome: string; descricao: string | null } | null
  permissoes: Permissao[]
  onClose: () => void
  onSaved: () => void
}

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'

export function RoleModal({ open, editing, permissoes, onClose, onSaved }: Props) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNome(editing?.nome ?? '')
    setDescricao(editing?.descricao ?? '')
    setError(null)
    if (editing) {
      supabase.from('role_permissoes').select('permissao_id').eq('role_id', editing.id).then(({ data }) => {
        setSelecionadas(new Set((data ?? []).map((r) => r.permissao_id as string)))
      })
    } else {
      setSelecionadas(new Set())
    }
  }, [open, editing])

  if (!open) return null

  const toggle = (id: string) => setSelecionadas((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const categorias = Array.from(new Set(permissoes.map((p) => p.categoria)))
  const todasMarcadas = permissoes.length > 0 && selecionadas.size === permissoes.length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true); setError(null)
    try {
      let roleId: string
      if (editing) {
        const { error: updErr } = await supabase.from('roles').update({ nome: nome.trim(), descricao: descricao.trim() || null }).eq('id', editing.id)
        if (updErr) throw updErr
        roleId = editing.id
      } else {
        const { data, error: insErr } = await supabase.from('roles').insert({ nome: nome.trim(), descricao: descricao.trim() || null }).select('id').single()
        if (insErr) throw insErr
        roleId = data.id
      }

      const { error: delErr } = await supabase.from('role_permissoes').delete().eq('role_id', roleId)
      if (delErr) throw delErr

      if (selecionadas.size > 0) {
        const { error: insErr } = await supabase.from('role_permissoes').insert(
          Array.from(selecionadas).map((permissao_id) => ({ role_id: roleId, permissao_id }))
        )
        if (insErr) throw insErr
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Papel' : 'Novo Papel'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome<span className="text-gold ml-1">*</span></label>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex: Financeiro, Operacional" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Descrição</label>
              <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="opcional" className={inputCls} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Telas liberadas</p>
                <button
                  type="button"
                  onClick={() => setSelecionadas(todasMarcadas ? new Set() : new Set(permissoes.map((p) => p.id)))}
                  className="text-xs text-gold hover:underline"
                >
                  {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
                </button>
              </div>
              {categorias.map((cat) => (
                <div key={cat} className="space-y-1.5">
                  <p className="text-xs text-gray-500">{cat}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {permissoes.filter((p) => p.categoria === cat).map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${selecionadas.has(p.id) ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                      >
                        <input type="checkbox" checked={selecionadas.has(p.id)} onChange={() => toggle(p.id)} className="accent-gold" />
                        {p.nome}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">{error}</div>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar Papel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

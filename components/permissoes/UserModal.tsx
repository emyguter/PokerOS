'use client'
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Permissao, RoleRow, UserRow } from './PermissoesView'

interface Props {
  open: boolean
  user: UserRow | null
  roles: RoleRow[]
  permissoes: Permissao[]
  onClose: () => void
  onSaved: () => void
}

type Override = 'herdar' | 'permitir' | 'bloquear'

export function UserModal({ open, user, roles, permissoes, onClose, onSaved }: Props) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !user) return
    setIsSuperAdmin(user.is_super_admin)
    setSelectedRoleIds(new Set(user.roleIds))
    setError(null)
    supabase.from('user_permissoes').select('permissao_id, allow').eq('user_id', user.id).then(({ data }) => {
      const map: Record<string, Override> = {}
      for (const row of data ?? []) map[row.permissao_id as string] = row.allow ? 'permitir' : 'bloquear'
      setOverrides(map)
    })
  }, [open, user])

  if (!open || !user) return null

  const toggleRole = (id: string) => setSelectedRoleIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const categorias = Array.from(new Set(permissoes.map((p) => p.categoria)))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true); setError(null)
    try {
      const { error: profErr } = await supabase.from('profiles').update({ is_super_admin: isSuperAdmin }).eq('id', user.id)
      if (profErr) throw profErr

      const { error: delRolesErr } = await supabase.from('user_roles').delete().eq('user_id', user.id)
      if (delRolesErr) throw delRolesErr
      if (selectedRoleIds.size > 0) {
        const { error: insRolesErr } = await supabase.from('user_roles').insert(
          Array.from(selectedRoleIds).map((role_id) => ({ user_id: user.id, role_id }))
        )
        if (insRolesErr) throw insRolesErr
      }

      const { error: delPermErr } = await supabase.from('user_permissoes').delete().eq('user_id', user.id)
      if (delPermErr) throw delPermErr
      const overrideRows = Object.entries(overrides)
        .filter(([, v]) => v !== 'herdar')
        .map(([permissao_id, v]) => ({ user_id: user.id, permissao_id, allow: v === 'permitir' }))
      if (overrideRows.length > 0) {
        const { error: insPermErr } = await supabase.from('user_permissoes').insert(overrideRows)
        if (insPermErr) throw insPermErr
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
          <div>
            <h2 className="text-lg font-semibold text-white">{user.nome || user.email}</h2>
            {user.nome && <p className="text-xs text-gray-500">{user.email}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            <label className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface2 cursor-pointer">
              <div>
                <p className="text-sm text-white font-medium">Super Admin</p>
                <p className="text-xs text-gray-500">Acesso total, ignora papéis e exceções. Também é quem gerencia essa tela.</p>
              </div>
              <div onClick={() => setIsSuperAdmin((v) => !v)} className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${isSuperAdmin ? 'bg-gold' : 'bg-white/10'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isSuperAdmin ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </label>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Papéis</p>
              {roles.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Nenhum papel cadastrado ainda — crie um na aba Papéis.</p>
              ) : (
                <div className="space-y-1.5">
                  {roles.map((r) => (
                    <label key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${selectedRoleIds.has(r.id) ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                      <input type="checkbox" checked={selectedRoleIds.has(r.id)} onChange={() => toggleRole(r.id)} className="accent-gold" />
                      {r.nome}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Exceções por tela</p>
                <p className="text-xs text-gray-600 mt-0.5">Sobrepõe o que os papéis já liberam, só pra esse usuário.</p>
              </div>
              {categorias.map((cat) => (
                <div key={cat} className="space-y-1.5">
                  <p className="text-xs text-gray-500">{cat}</p>
                  {permissoes.filter((p) => p.categoria === cat).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-white/10">
                      <span className="text-sm text-gray-300">{p.nome}</span>
                      <select
                        value={overrides[p.id] ?? 'herdar'}
                        onChange={(e) => setOverrides((prev) => ({ ...prev, [p.id]: e.target.value as Override }))}
                        className="bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold/50"
                      >
                        <option value="herdar">Herdar do papel</option>
                        <option value="permitir">Sempre permitir</option>
                        <option value="bloquear">Sempre bloquear</option>
                      </select>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">{error}</div>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

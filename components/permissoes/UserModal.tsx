'use client'
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import type { ClubeOpcao, Permissao, RoleRow, UserRow } from './PermissoesView'

interface Props {
  open: boolean
  user: UserRow | null
  roles: RoleRow[]
  permissoes: Permissao[]
  clubes: ClubeOpcao[]
  onClose: () => void
  onSaved: () => void
}

type Override = 'herdar' | 'permitir' | 'bloquear'
type TipoAcesso = 'staff' | 'clube'

export function UserModal({ open, user, roles, permissoes, clubes, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const [tipoAcesso, setTipoAcesso] = useState<TipoAcesso>('staff')
  const [clubeId, setClubeId] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !user) return
    setTipoAcesso(user.clube_id ? 'clube' : 'staff')
    setClubeId(user.clube_id ?? '')
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
    if (tipoAcesso === 'clube' && !clubeId) { setError('Escolha o clube.'); return }
    setSaving(true); setError(null)
    try {
      const ehClube = tipoAcesso === 'clube'
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ is_super_admin: ehClube ? false : isSuperAdmin, clube_id: ehClube ? clubeId : null })
        .eq('id', user.id)
      if (profErr) throw profErr

      const { error: delRolesErr } = await supabase.from('user_roles').delete().eq('user_id', user.id)
      if (delRolesErr) throw delRolesErr
      if (!ehClube && selectedRoleIds.size > 0) {
        const { error: insRolesErr } = await supabase.from('user_roles').insert(
          Array.from(selectedRoleIds).map((role_id) => ({ user_id: user.id, role_id }))
        )
        if (insRolesErr) throw insRolesErr
      }

      const { error: delPermErr } = await supabase.from('user_permissoes').delete().eq('user_id', user.id)
      if (delPermErr) throw delPermErr
      const overrideRows = ehClube ? [] : Object.entries(overrides)
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

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('user_modal.tipo_acesso')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoAcesso('staff')}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${tipoAcesso === 'staff' ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                >
                  {t('user_modal.staff')}
                  <p className="text-xs font-normal text-gray-500 mt-0.5">{t('user_modal.staff_desc')}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoAcesso('clube')}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${tipoAcesso === 'clube' ? 'border-purple/50 bg-purple/10 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                >
                  {t('user_modal.clube')}
                  <p className="text-xs font-normal text-gray-500 mt-0.5">{t('user_modal.clube_desc')}</p>
                </button>
              </div>
              {tipoAcesso === 'clube' && (
                <select
                  value={clubeId}
                  onChange={(e) => setClubeId(e.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50 mt-2"
                >
                  <option value="">{t('user_modal.selecione_clube')}</option>
                  {clubes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>

            {tipoAcesso === 'staff' && (
              <>
                <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface2">
                  <div>
                    <p className="text-sm text-white font-medium">{t('permissoes.super_admin')}</p>
                    <p className="text-xs text-gray-500">{t('user_modal.super_admin_desc_gerencia')}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isSuperAdmin}
                    aria-label="Super Admin"
                    onClick={() => setIsSuperAdmin((v) => !v)}
                    className={`w-10 h-6 rounded-full transition-colors relative shrink-0 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:ring-offset-2 focus:ring-offset-surface2 ${isSuperAdmin ? 'bg-gold' : 'bg-white/10'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isSuperAdmin ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('user_modal.papeis')}</p>
                  {roles.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">{t('user_modal.sem_papeis')}</p>
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
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('user_modal.excecoes')}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{t('user_modal.excecoes_desc')}</p>
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
                            <option value="herdar">{t('user_modal.herdar')}</option>
                            <option value="permitir">{t('user_modal.permitir')}</option>
                            <option value="bloquear">{t('user_modal.bloquear')}</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">{t('common.cancelar')}</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}{t('user_modal.salvar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

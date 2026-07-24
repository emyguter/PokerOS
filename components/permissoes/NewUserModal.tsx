'use client'
import { useState, useEffect } from 'react'
import { X, Loader2, Dices, Copy, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import type { AgenteOpcao, ClubeOpcao, RoleRow } from './PermissoesView'

interface Props {
  open: boolean
  roles: RoleRow[]
  clubes: ClubeOpcao[]
  agentes: AgenteOpcao[]
  onClose: () => void
  onSaved: () => void
}

type TipoAcesso = 'staff' | 'clube' | 'agente'

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'

function gerarSenha() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export function NewUserModal({ open, roles, clubes, agentes, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [tipoAcesso, setTipoAcesso] = useState<TipoAcesso>('staff')
  const [clubeId, setClubeId] = useState('')
  const [agenteId, setAgenteId] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNome(''); setEmail(''); setPassword(gerarSenha()); setCopiado(false)
    setTipoAcesso('staff'); setClubeId(''); setAgenteId(''); setIsSuperAdmin(false)
    setSelectedRoleIds(new Set()); setError(null)
  }, [open])

  if (!open) return null

  const toggleRole = (id: string) => setSelectedRoleIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  async function copiarSenha() {
    await navigator.clipboard.writeText(password)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) { setError('Email e senha são obrigatórios.'); return }
    if (tipoAcesso === 'clube' && !clubeId) { setError('Escolha o clube.'); return }
    if (tipoAcesso === 'agente' && !agenteId) { setError('Escolha o agente.'); return }
    setSaving(true); setError(null)
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('criar-usuario', {
        body: {
          email: email.trim(),
          password,
          nome: nome.trim() || undefined,
          tipoAcesso,
          isSuperAdmin,
          clubeId: tipoAcesso === 'clube' ? clubeId : undefined,
          agenteId: tipoAcesso === 'agente' ? agenteId : undefined,
          roleIds: tipoAcesso === 'staff' ? Array.from(selectedRoleIds) : undefined,
        },
      })
      if (invokeErr) throw invokeErr
      if (!data?.ok) throw new Error(data?.error ?? 'Erro ao criar usuário.')
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
          <h2 className="text-lg font-semibold text-white">{t('permissoes.novo_usuario')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('user_modal.nome')}</label>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t('role_modal.descricao_placeholder')} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('user_modal.email')}<span className="text-gray-500 ml-1">*</span></label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder={t('user_modal.email_placeholder')} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('user_modal.senha')}<span className="text-gray-500 ml-1">*</span></label>
              <div className="flex gap-2">
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required className={`${inputCls} font-mono`} />
                <button type="button" onClick={() => setPassword(gerarSenha())} title={t('user_modal.gerar_senha')} className="px-3 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors shrink-0">
                  <Dices size={16} />
                </button>
                <button type="button" onClick={copiarSenha} title={t('user_modal.copiar_senha')} className="px-3 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors shrink-0">
                  {copiado ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1.5">{t('user_modal.senha_ajuda')}</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('user_modal.tipo_acesso')}</p>
              <div className="grid grid-cols-3 gap-2">
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
                <button
                  type="button"
                  onClick={() => setTipoAcesso('agente')}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${tipoAcesso === 'agente' ? 'border-gold/50 bg-gold/10 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
                >
                  {t('user_modal.agente')}
                  <p className="text-xs font-normal text-gray-500 mt-0.5">{t('user_modal.agente_desc')}</p>
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
              {tipoAcesso === 'agente' && (
                <select
                  value={agenteId}
                  onChange={(e) => setAgenteId(e.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50 mt-2"
                >
                  <option value="">{t('user_modal.selecione_agente')}</option>
                  {agentes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>

            {tipoAcesso === 'staff' && (
              <>
                <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-surface2">
                  <div>
                    <p className="text-sm text-white font-medium">{t('permissoes.super_admin')}</p>
                    <p className="text-xs text-gray-500">{t('user_modal.super_admin_desc')}</p>
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
              </>
            )}

            {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">{t('common.cancelar')}</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}{t('user_modal.criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

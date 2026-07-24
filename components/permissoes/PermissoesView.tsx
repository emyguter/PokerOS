'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { RoleModal } from './RoleModal'
import { UserModal } from './UserModal'
import { NewUserModal } from './NewUserModal'

export interface Permissao { id: string; chave: string; nome: string; categoria: string }
export interface RoleRow { id: string; nome: string; descricao: string | null; permissaoCount: number; userCount: number }
export interface ClubeOpcao { id: string; name: string }
export interface AgenteOpcao { id: string; name: string }
export interface UserRow { id: string; email: string | null; nome: string | null; is_super_admin: boolean; clube_id: string | null; agente_id: string | null; roleIds: string[]; roleNomes: string[] }

export function PermissoesView() {
  const { refresh: refreshMinhasPermissoes } = usePermissions()
  const { t } = useI18n()
  const [tab, setTab] = useState<'papeis' | 'usuarios'>('papeis')
  const [permissoes, setPermissoes] = useState<Permissao[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [agentes, setAgentes] = useState<AgenteOpcao[]>([])
  const [loading, setLoading] = useState(true)

  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<{ id: string; nome: string; descricao: string | null } | null>(null)
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleRow | null>(null)

  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [newUserModalOpen, setNewUserModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: permsData }, { data: rolesData }, { data: rolePermsData }, { data: profilesData }, { data: userRolesData }, { data: clubesData }, { data: agentesData }] = await Promise.all([
      supabase.from('permissoes').select('id, chave, nome, categoria').order('categoria').order('nome'),
      supabase.from('roles').select('id, nome, descricao').order('nome'),
      supabase.from('role_permissoes').select('role_id, permissao_id'),
      supabase.from('profiles').select('id, email, nome, is_super_admin, clube_id, agente_id').order('email'),
      supabase.from('user_roles').select('user_id, role_id, roles(nome)'),
      supabase.from('clubs').select('id, name').order('name'),
      supabase.from('agentes').select('id, nome').order('nome'),
    ])

    const rp = rolePermsData ?? []
    const ur = (userRolesData ?? []) as unknown as { user_id: string; role_id: string; roles: { nome: string } | null }[]

    setPermissoes(permsData ?? [])
    setClubes(clubesData ?? [])
    setAgentes((agentesData ?? []).map((a) => ({ id: a.id, name: a.nome })))
    setRoles(
      (rolesData ?? []).map((r) => ({
        ...r,
        permissaoCount: rp.filter((x) => x.role_id === r.id).length,
        userCount: ur.filter((x) => x.role_id === r.id).length,
      }))
    )
    setUsers(
      (profilesData ?? []).map((p) => ({
        ...p,
        roleIds: ur.filter((x) => x.user_id === p.id).map((x) => x.role_id),
        roleNomes: ur.filter((x) => x.user_id === p.id).map((x) => x.roles?.nome).filter((n): n is string => !!n),
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDeleteRole() {
    if (!deleteRoleTarget) return
    await supabase.from('roles').delete().eq('id', deleteRoleTarget.id)
    setDeleteRoleTarget(null)
    await load()
    await refreshMinhasPermissoes()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('permissoes.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('permissoes.subtitulo')}</p>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setTab('papeis')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'papeis' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
          <ShieldCheck size={14} />{t('permissoes.aba_papeis')}
        </button>
        <button
          onClick={() => setTab('usuarios')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'usuarios' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
          <UsersIcon size={14} />{t('permissoes.aba_usuarios')}
        </button>
      </div>

      {tab === 'papeis' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setEditingRole(null); setRoleModalOpen(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors"
            >
              <Plus size={16} />{t('permissoes.novo_papel')}
            </button>
          </div>
          <CadastroTable
            columns={[
              { key: 'nome', label: t('permissoes.col_papel') },
              { key: 'descricao', label: t('permissoes.col_descricao'), render: (v: string) => v || '—' },
              { key: 'permissaoCount', label: t('permissoes.col_telas'), render: (v: number) => t('permissoes.telas_de', { v, total: permissoes.length }) },
              { key: 'userCount', label: t('permissoes.col_usuarios'), render: (v: number) => `${v}` },
            ]}
            data={roles}
            loading={loading}
            onEdit={(item) => { setEditingRole(item); setRoleModalOpen(true) }}
            onDelete={(item) => setDeleteRoleTarget(item)}
          />
        </div>
      )}

      {tab === 'usuarios' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setNewUserModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors"
            >
              <Plus size={16} />{t('permissoes.novo_usuario')}
            </button>
          </div>
          <div className="rounded-xl border border-white/10 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">{t('permissoes.nenhum_usuario')}</div>
          ) : (
            <div className="divide-y divide-white/5">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setEditingUser(u); setUserModalOpen(true) }}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div>
                    <p className="text-sm text-white font-medium">{u.nome || u.email || u.id}</p>
                    {u.nome && <p className="text-xs text-gray-500">{u.email}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {u.is_super_admin && <span className="px-2 py-0.5 rounded-full bg-gold/15 text-gold text-xs font-medium">{t('permissoes.super_admin')}</span>}
                    {u.clube_id && (
                      <span className="px-2 py-0.5 rounded-full bg-purple/10 border border-purple/30 text-purple text-xs">
                        {t('permissoes.clube_badge')} · {clubes.find((c) => c.id === u.clube_id)?.name ?? '—'}
                      </span>
                    )}
                    {u.agente_id && (
                      <span className="px-2 py-0.5 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs">
                        {t('user_modal.agente')} · {agentes.find((a) => a.id === u.agente_id)?.name ?? '—'}
                      </span>
                    )}
                    {u.roleNomes.map((r) => <span key={r} className="px-2 py-0.5 rounded-full bg-surface2 border border-white/10 text-gray-300 text-xs">{r}</span>)}
                    {u.roleNomes.length === 0 && !u.is_super_admin && !u.clube_id && !u.agente_id && <span className="text-xs text-gray-600 italic">{t('permissoes.sem_papel')}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

      <RoleModal
        open={roleModalOpen}
        editing={editingRole}
        permissoes={permissoes}
        onClose={() => setRoleModalOpen(false)}
        onSaved={async () => { setRoleModalOpen(false); await load(); await refreshMinhasPermissoes() }}
      />

      <UserModal
        open={userModalOpen}
        user={editingUser}
        roles={roles}
        permissoes={permissoes}
        clubes={clubes}
        agentes={agentes}
        onClose={() => setUserModalOpen(false)}
        onSaved={async () => { setUserModalOpen(false); await load(); await refreshMinhasPermissoes() }}
      />

      <NewUserModal
        open={newUserModalOpen}
        roles={roles}
        clubes={clubes}
        agentes={agentes}
        onClose={() => setNewUserModalOpen(false)}
        onSaved={async () => { setNewUserModalOpen(false); await load() }}
      />

      {deleteRoleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteRoleTarget(null)} />
          <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl">
            <p className="text-white font-medium mb-1">{t('permissoes.apagar_papel_confirm', { nome: deleteRoleTarget.nome })}</p>
            <p className="text-sm text-gray-500 mb-5">{t('permissoes.apagar_papel_desc')}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteRoleTarget(null)} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">{t('common.cancelar')}</button>
              <button onClick={handleDeleteRole} className="px-4 py-2 bg-alert/15 border border-alert/40 text-alert rounded-lg text-sm font-medium hover:bg-alert/25 transition-colors">{t('permissoes.apagar')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

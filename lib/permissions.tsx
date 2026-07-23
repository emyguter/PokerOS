'use client'
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface Permissao {
  id: string
  chave: string
  nome: string
  categoria: string
}

export interface Role {
  id: string
  nome: string
  descricao: string | null
}

export interface Profile {
  id: string
  email: string | null
  nome: string | null
  is_super_admin: boolean
  clube_id: string | null
}

interface PermissionsContextValue {
  loading: boolean
  user: User | null
  profile: Profile | null
  isSuperAdmin: boolean
  chaves: Set<string>
  hasPermission: (chave: string) => boolean
  refresh: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue>({
  loading: true,
  user: null,
  profile: null,
  isSuperAdmin: false,
  chaves: new Set(),
  hasPermission: () => false,
  refresh: async () => {},
})

async function fetchEffectivePermissions(userId: string): Promise<Set<string>> {
  const chaves = new Set<string>()

  const { data: userRoles } = await supabase.from('user_roles').select('role_id').eq('user_id', userId)
  const roleIds = (userRoles ?? []).map((r) => r.role_id as string)

  if (roleIds.length > 0) {
    const { data: rolePerms } = await supabase
      .from('role_permissoes')
      .select('permissoes(chave)')
      .in('role_id', roleIds)
    for (const rp of (rolePerms ?? []) as unknown as { permissoes: { chave: string } | null }[]) {
      if (rp.permissoes?.chave) chaves.add(rp.permissoes.chave)
    }
  }

  const { data: overrides } = await supabase
    .from('user_permissoes')
    .select('allow, permissoes(chave)')
    .eq('user_id', userId)
  for (const o of (overrides ?? []) as unknown as { allow: boolean; permissoes: { chave: string } | null }[]) {
    if (!o.permissoes?.chave) continue
    if (o.allow) chaves.add(o.permissoes.chave)
    else chaves.delete(o.permissoes.chave)
  }

  return chaves
}

export function usePermissionsProvider(): PermissionsContextValue {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [chaves, setChaves] = useState<Set<string>>(new Set())

  const load = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null); setChaves(new Set()); setLoading(false)
      return
    }
    const [{ data: profileData }, efetivas] = await Promise.all([
      supabase.from('profiles').select('id, email, nome, is_super_admin, clube_id').eq('id', u.id).maybeSingle(),
      fetchEffectivePermissions(u.id),
    ])
    setProfile((profileData as Profile) ?? null)
    setChaves(efetivas)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); load(data.user) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(true)
      load(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const refresh = useCallback(async () => { await load(user) }, [load, user])
  const isSuperAdmin = !!profile?.is_super_admin
  const hasPermission = useCallback((chave: string) => isSuperAdmin || chaves.has(chave), [isSuperAdmin, chaves])

  return useMemo(
    () => ({ loading, user, profile, isSuperAdmin, chaves, hasPermission, refresh }),
    [loading, user, profile, isSuperAdmin, chaves, hasPermission, refresh]
  )
}

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const value = usePermissionsProvider()
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions() {
  return useContext(PermissionsContext)
}

'use client'
import { Lock } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'

export function PermissionGuard({ chave, children }: { chave: string; children: React.ReactNode }) {
  const { loading, hasPermission } = usePermissions()

  if (loading) return null
  if (!hasPermission(chave)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Lock size={28} className="text-gray-600" />
        <p className="text-white font-medium">Você não tem permissão pra ver essa tela</p>
        <p className="text-sm text-gray-500">Peça pra um administrador liberar o acesso em Permissões.</p>
      </div>
    )
  }
  return <>{children}</>
}

'use client'
import { Lock } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'
import { PermissoesView } from '@/components/permissoes/PermissoesView'

export default function Page() {
  const { loading, isSuperAdmin } = usePermissions()

  if (loading) return null
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Lock size={28} className="text-gray-600" />
        <p className="text-white font-medium">Só administradores acessam essa tela</p>
        <p className="text-sm text-gray-500">Peça pra um super admin liberar você.</p>
      </div>
    )
  }
  return <PermissoesView />
}

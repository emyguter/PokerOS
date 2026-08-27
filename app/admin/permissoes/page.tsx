'use client'
import { Suspense } from 'react'
import { Lock } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'
import { PermissoesView } from '@/components/permissoes/PermissoesView'
import { useI18n } from '@/lib/i18n'

export default function Page() {
  const { t } = useI18n()
  const { loading, isSuperAdmin } = usePermissions()

  if (loading) return null
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Lock size={28} className="text-gray-600" />
        <p className="text-white font-medium">{t('acesso_restrito.so_administradores')}</p>
        <p className="text-sm text-gray-500">{t('acesso_restrito.peca_super_admin')}</p>
      </div>
    )
  }
  return <Suspense fallback={null}><PermissoesView /></Suspense>
}

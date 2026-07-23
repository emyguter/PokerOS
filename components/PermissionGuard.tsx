'use client'
import { Lock } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

export function PermissionGuard({ chave, children }: { chave: string; children: React.ReactNode }) {
  const { loading, hasPermission } = usePermissions()
  const { t } = useI18n()

  if (loading) return null
  if (!hasPermission(chave)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Lock size={28} className="text-gray-600" />
        <p className="text-white font-medium">{t('cadastro_menu.sem_permissao_titulo')}</p>
        <p className="text-sm text-gray-500">{t('cadastro_menu.sem_permissao_desc')}</p>
      </div>
    )
  }
  return <>{children}</>
}

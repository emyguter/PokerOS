'use client'
import { Lock } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { MeusAcertosView } from '@/components/acertos/MeusAcertosView'

export default function Page() {
  const { loading, profile, hasPermission } = usePermissions()
  const { t } = useI18n()

  if (loading) return null

  const temEntidade = !!(profile?.clube_id || profile?.liga_id || profile?.super_league_id || profile?.mega_liga_id)
  if (!temEntidade && !hasPermission('acertos.ver')) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Lock size={28} className="text-gray-600" />
        <p className="text-white font-medium">{t('cadastro_menu.sem_permissao_titulo')}</p>
        <p className="text-sm text-gray-500">{t('cadastro_menu.sem_permissao_desc')}</p>
      </div>
    )
  }

  return <MeusAcertosView />
}

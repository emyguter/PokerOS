'use client'
import { usePermissions } from '@/lib/permissions'
import { AgentesAcertosView } from '@/components/acertos/AgentesAcertosView'
import { useI18n } from '@/lib/i18n'

export default function Page() {
  const { t } = useI18n()
  const { loading, profile } = usePermissions()

  if (loading) return null

  if (!profile?.agente_id) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-white font-medium">{t('acesso_restrito.nao_vinculado_agente')}</p>
        <p className="text-sm text-gray-500">{t('acesso_restrito.peca_admin_permissoes')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6" style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('agente_extrato_page.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('agente_extrato_page.subtitulo')}</p>
      </div>
      <AgentesAcertosView agenteIdFixo={profile.agente_id} />
    </div>
  )
}

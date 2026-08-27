'use client'
import { usePermissions } from '@/lib/permissions'
import { ExtratoView } from '@/components/lancamento/ExtratoView'
import { useI18n } from '@/lib/i18n'

// Referência estável — um array literal direto na prop seria recriado a
// cada render, mudando de identidade e disparando um loop de recarregamento
// dentro do ExtratoView (useEffect que depende de `origens`).
const ORIGENS_EXTRATO_CLUBE: ('suporte' | 'seguranca')[] = ['suporte', 'seguranca']

export default function Page() {
  const { t } = useI18n()
  const { loading, profile } = usePermissions()

  if (loading) return null

  if (!profile?.clube_id) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-white font-medium">{t('acesso_restrito.nao_vinculado_clube')}</p>
        <p className="text-sm text-gray-500">{t('acesso_restrito.peca_admin_permissoes')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('extrato_page.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('extrato_page.subtitulo')}</p>
      </div>
      <ExtratoView clubeIdFixo={profile.clube_id} origens={ORIGENS_EXTRATO_CLUBE} />
    </div>
  )
}

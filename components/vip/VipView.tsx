'use client'
import { useState, useMemo } from 'react'
import { Crown, BarChart3, Settings } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { usePermissions } from '@/lib/permissions'
import { VipLancamentoView } from './VipLancamentoView'
import { VipRelatorioView } from './VipRelatorioView'
import { VipLimitesView } from './VipLimitesView'

type Tab = 'lancamento' | 'relatorio' | 'limites'

export function VipView() {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()

  // vip.relatorio e vip.limites não herdam de "vip" de propósito — mesmo
  // padrão de relatorios.taxas: dado cross-clube/administrativo sensível,
  // só abre pra quem for liberado explicitamente na chave própria.
  const podeLancamento = hasPermission('vip')
  const podeRelatorio = hasPermission('vip.relatorio')
  const podeLimites = hasPermission('vip.limites')

  const abas = useMemo(() => [
    ...(podeLancamento ? [{ key: 'lancamento' as Tab, labelKey: 'vip.aba_lancamento', icon: Crown }] : []),
    ...(podeRelatorio ? [{ key: 'relatorio' as Tab, labelKey: 'vip.aba_relatorio', icon: BarChart3 }] : []),
    ...(podeLimites ? [{ key: 'limites' as Tab, labelKey: 'vip.aba_limites', icon: Settings }] : []),
  ], [podeLancamento, podeRelatorio, podeLimites])

  const [tab, setTab] = useState<Tab | null>(null)
  const abaAtiva = tab && abas.some((a) => a.key === tab) ? tab : (abas[0]?.key ?? null)

  if (!abaAtiva) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('vip.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {abaAtiva === 'relatorio' ? t('vip.relatorio_subtitulo') : abaAtiva === 'limites' ? t('vip.limites_subtitulo') : t('vip.subtitulo')}
        </p>
      </div>

      {abas.length > 1 && (
        <div className="flex gap-2 border-b border-white/10 overflow-x-auto">
          {abas.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${abaAtiva === key ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'}`}
            >
              <Icon size={14} />{t(labelKey)}
            </button>
          ))}
        </div>
      )}

      {abaAtiva === 'lancamento' && <VipLancamentoView />}
      {abaAtiva === 'relatorio' && <VipRelatorioView />}
      {abaAtiva === 'limites' && <VipLimitesView />}
    </div>
  )
}

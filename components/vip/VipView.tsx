'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { usePermissions } from '@/lib/permissions'
import { VipLancamentoView } from './VipLancamentoView'
import { VipRelatorioView } from './VipRelatorioView'
import { VipLimitesView } from './VipLimitesView'

type Tab = 'lancamento' | 'relatorio' | 'limites'

function tabDaUrl(valor: string | null): Tab | null {
  return valor === 'lancamento' || valor === 'relatorio' || valor === 'limites' ? valor : null
}

export function VipView() {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()
  const searchParams = useSearchParams()

  // vip.relatorio e vip.limites não herdam de "vip" de propósito — mesmo
  // padrão de relatorios.taxas: dado cross-clube/administrativo sensível,
  // só abre pra quem for liberado explicitamente na chave própria.
  const podeLancamento = hasPermission('vip')
  const podeRelatorio = hasPermission('vip.relatorio')
  const podeLimites = hasPermission('vip.limites')
  const primeiraPermitida: Tab | null = podeLancamento ? 'lancamento' : podeRelatorio ? 'relatorio' : podeLimites ? 'limites' : null
  const ehPermitida = (aba: Tab) => aba === 'lancamento' ? podeLancamento : aba === 'relatorio' ? podeRelatorio : podeLimites

  const [tab, setTab] = useState<Tab | null>(null)

  // Submenu da sidebar linka pra cá com ?tab=X — mesmo mecanismo de
  // Lançamento/Financeiro/Segurança (ver comentário lá e em Sidebar.tsx).
  useEffect(() => {
    const daUrl = tabDaUrl(searchParams.get('tab'))
    if (daUrl) setTab(daUrl)
  }, [searchParams])

  const abaAtiva = tab && ehPermitida(tab) ? tab : primeiraPermitida

  if (!abaAtiva) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('vip.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {abaAtiva === 'relatorio' ? t('vip.relatorio_subtitulo') : abaAtiva === 'limites' ? t('vip.limites_subtitulo') : t('vip.subtitulo')}
        </p>
      </div>

      {abaAtiva === 'lancamento' && <VipLancamentoView />}
      {abaAtiva === 'relatorio' && <VipRelatorioView />}
      {abaAtiva === 'limites' && <VipLimitesView />}
    </div>
  )
}

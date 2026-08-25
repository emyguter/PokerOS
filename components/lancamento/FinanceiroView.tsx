'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { usePermissions } from '@/lib/permissions'
import { LancarFinanceiroTab } from './LancarFinanceiroTab'
import { PendenciasFinanceiro } from './PendenciasFinanceiro'
import { ConciliacaoView } from './ConciliacaoView'
import { CobrancaView } from './CobrancaView'
import { ExtratoView } from './ExtratoView'

type Tab = 'lancar' | 'pendencias' | 'conciliacao' | 'cobranca' | 'extrato'

function tabDaUrl(valor: string | null): Tab | null {
  return valor === 'lancar' || valor === 'pendencias' || valor === 'conciliacao' || valor === 'cobranca' || valor === 'extrato' ? valor : null
}

export function FinanceiroView() {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('lancar')

  // Submenu da sidebar linka pra cá com ?tab=X. Precisa reagir a navegação
  // subsequente: trocar de item do submenu não muda de rota (mesma
  // /financeiro, só a query), então o componente não remonta —
  // `useSearchParams` é o único jeito de pegar essa mudança.
  useEffect(() => {
    const daUrl = tabDaUrl(searchParams.get('tab'))
    if (daUrl) setTab(daUrl)
  }, [searchParams])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('lancamento.genia.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('lancamento.genia.subtitulo')}</p>
      </div>

      {tab === 'lancar' && <LancarFinanceiroTab />}
      {tab === 'pendencias' && <PendenciasFinanceiro />}
      {tab === 'conciliacao' && hasPermission('conciliacao') && <ConciliacaoView />}
      {tab === 'cobranca' && <CobrancaView />}
      {tab === 'extrato' && <ExtratoView origens={['genia']} />}
    </div>
  )
}

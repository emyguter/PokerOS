'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { usePermissions } from '@/lib/permissions'
import { RelatorioStoploss } from './RelatorioStoploss'
import { ResumoStoploss } from './ResumoStoploss'
import { ExtratoStoploss } from './ExtratoStoploss'
import { FilaAprovacaoStoploss } from './FilaAprovacaoStoploss'

type Tab = 'relatorio' | 'resumo' | 'extrato' | 'fila'

function tabDaUrl(valor: string | null): Tab | null {
  return valor === 'relatorio' || valor === 'resumo' || valor === 'extrato' || valor === 'fila' ? valor : null
}

export function StoplossView() {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('relatorio')

  // Submenu da sidebar linka pra cá com ?tab=X — mesmo mecanismo de
  // Lançamento/Financeiro/Segurança (ver comentário lá e em Sidebar.tsx).
  useEffect(() => {
    const daUrl = tabDaUrl(searchParams.get('tab'))
    if (daUrl) setTab(daUrl)
  }, [searchParams])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('stoploss.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('stoploss.subtitulo')}</p>
      </div>

      {tab === 'relatorio' && <RelatorioStoploss />}
      {tab === 'resumo' && <ResumoStoploss />}
      {tab === 'extrato' && <ExtratoStoploss />}
      {tab === 'fila' && hasPermission('stoploss.aprovar') && <FilaAprovacaoStoploss />}
    </div>
  )
}

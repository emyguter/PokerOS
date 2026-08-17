'use client'
import { useState, useEffect } from 'react'
import { PlusCircle, AlertCircle, GitMerge } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { usePermissions } from '@/lib/permissions'
import { LancarFinanceiroTab } from './LancarFinanceiroTab'
import { PendenciasFinanceiro } from './PendenciasFinanceiro'
import { ConciliacaoView } from './ConciliacaoView'

type Tab = 'lancar' | 'pendencias' | 'conciliacao'

function tabDaUrl(): Tab | null {
  const t = new URLSearchParams(window.location.search).get('tab')
  return t === 'lancar' || t === 'pendencias' || t === 'conciliacao' ? t : null
}

export function FinanceiroView() {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()
  const [tab, setTab] = useState<Tab>('lancar')

  // Submenu da sidebar linka pra cá com ?tab=X — lido só no mount (não é
  // preciso reagir a navegação subsequente, a página inteira remonta ao
  // trocar de rota).
  useEffect(() => {
    const daUrl = tabDaUrl()
    if (daUrl) setTab(daUrl)
  }, [])

  const abas: { key: Tab; labelKey: string; icon: typeof PlusCircle }[] = [
    { key: 'lancar', labelKey: 'lancamento.aba_lancar', icon: PlusCircle },
    { key: 'pendencias', labelKey: 'lancamento.aba_pendencias', icon: AlertCircle },
    ...(hasPermission('conciliacao') ? [{ key: 'conciliacao' as Tab, labelKey: 'lancamento.aba_conciliacao', icon: GitMerge }] : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('lancamento.genia.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('lancamento.genia.subtitulo')}</p>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        {abas.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            <Icon size={14} />{t(labelKey)}
          </button>
        ))}
      </div>

      {tab === 'lancar' && <LancarFinanceiroTab />}
      {tab === 'pendencias' && <PendenciasFinanceiro />}
      {tab === 'conciliacao' && hasPermission('conciliacao') && <ConciliacaoView />}
    </div>
  )
}

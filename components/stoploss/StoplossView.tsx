'use client'
import { useState } from 'react'
import { LayoutList, Gauge, Receipt, ClipboardCheck } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { usePermissions } from '@/lib/permissions'
import { RelatorioStoploss } from './RelatorioStoploss'
import { ResumoStoploss } from './ResumoStoploss'
import { ExtratoStoploss } from './ExtratoStoploss'
import { FilaAprovacaoStoploss } from './FilaAprovacaoStoploss'

type Tab = 'relatorio' | 'resumo' | 'extrato' | 'fila'

export function StoplossView() {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()
  const [tab, setTab] = useState<Tab>('relatorio')

  const abas: { key: Tab; labelKey: string; icon: typeof Gauge }[] = [
    { key: 'relatorio', labelKey: 'stoploss.aba_relatorio', icon: LayoutList },
    { key: 'resumo', labelKey: 'stoploss.aba_resumo', icon: Gauge },
    { key: 'extrato', labelKey: 'stoploss.aba_extrato', icon: Receipt },
    ...(hasPermission('stoploss.aprovar') ? [{ key: 'fila' as Tab, labelKey: 'stoploss.aba_fila', icon: ClipboardCheck }] : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('stoploss.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('stoploss.subtitulo')}</p>
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

      {tab === 'relatorio' && <RelatorioStoploss />}
      {tab === 'resumo' && <ResumoStoploss />}
      {tab === 'extrato' && <ExtratoStoploss />}
      {tab === 'fila' && hasPermission('stoploss.aprovar') && <FilaAprovacaoStoploss />}
    </div>
  )
}

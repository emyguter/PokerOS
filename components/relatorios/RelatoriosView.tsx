'use client'
import { useState, useMemo } from 'react'
import { BarChart3, Receipt } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { usePermissions } from '@/lib/permissions'
import AcertosView from '@/components/acertos/AcertosView'
import { RelatorioLancamentos } from './RelatorioLancamentos'

type Tab = 'acertos' | 'lancamentos'

export function RelatoriosView() {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()

  // "relatorios" sozinho ainda dá acesso a tudo (compatibilidade com quem já
  // tinha isso liberado); as chaves específicas servem pra dar acesso só a
  // um relatório — ex: CS só vê Lançamentos, sem abrir a tela de Lançamento
  // de verdade nem o relatório de Acertos.
  const podeAcertos = hasPermission('relatorios') || hasPermission('relatorios.acertos')
  const podeLancamentos = hasPermission('relatorios') || hasPermission('relatorios.lancamentos')

  const abas = useMemo(() => [
    ...(podeAcertos ? [{ key: 'acertos' as Tab, labelKey: 'relatorios.aba_acertos', icon: BarChart3 }] : []),
    ...(podeLancamentos ? [{ key: 'lancamentos' as Tab, labelKey: 'relatorios.aba_lancamentos', icon: Receipt }] : []),
  ], [podeAcertos, podeLancamentos])

  const [tab, setTab] = useState<Tab | null>(null)
  const abaAtiva = tab && abas.some(a => a.key === tab) ? tab : (abas[0]?.key ?? null)

  if (!abaAtiva) return null

  return (
    <div>
      {abas.length > 1 && (
        <div className="flex gap-2 border-b border-white/10 px-4 md:px-10 pt-6 overflow-x-auto" style={{ background: '#0C0E0B' }}>
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

      {abaAtiva === 'acertos' && <AcertosView />}
      {abaAtiva === 'lancamentos' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('relatorios.titulo_lancamentos')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_lancamentos')}</p>
          </div>
          <RelatorioLancamentos />
        </div>
      )}
    </div>
  )
}

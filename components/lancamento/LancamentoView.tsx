'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { LancarForm } from './LancarForm'
import { ExtratoView } from './ExtratoView'
import { PendenciasSuporte } from './PendenciasSuporte'
import { ControlePagamentosView } from './ControlePagamentosView'
import { ConferenciaAppView } from './ConferenciaAppView'

type Tab = 'lancar' | 'extrato' | 'pendencias' | 'pagamentos' | 'extra' | 'conferencia'

// Referência estável — ver mesmo comentário em app/extrato/page.tsx sobre
// por que `origens`/arrays de filtro do ExtratoView precisam ser um módulo
// fixo, não um literal recriado a cada render.
const TIPOS_EXTRA = ['bonus', 'promocao', 'outro']

function tabDaUrl(valor: string | null): Tab | null {
  return valor === 'lancar' || valor === 'extrato' || valor === 'pendencias' || valor === 'pagamentos' || valor === 'extra' || valor === 'conferencia' ? valor : null
}

export function LancamentoView() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('lancar')

  // Submenu da sidebar linka pra cá com ?tab=X. Precisa reagir a navegação
  // subsequente (não só no mount): clicar de um item do submenu pra outro
  // não troca de rota (mesma /lancamento, só muda a query), então o
  // componente não remonta — `useSearchParams` é o único jeito de pegar
  // essa mudança (window.location.search direto só funcionaria no mount).
  useEffect(() => {
    const daUrl = tabDaUrl(searchParams.get('tab'))
    if (daUrl) setTab(daUrl)
  }, [searchParams])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('lancamento.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('lancamento.subtitulo')}</p>
      </div>

      {tab === 'lancar' && <LancarForm origem="suporte" />}
      {tab === 'extrato' && <ExtratoView />}
      {tab === 'pendencias' && <PendenciasSuporte />}
      {tab === 'pagamentos' && <ControlePagamentosView />}
      {tab === 'extra' && <ExtratoView apenasTipos={TIPOS_EXTRA} mostrarLiberar />}
      {tab === 'conferencia' && <ConferenciaAppView />}
    </div>
  )
}

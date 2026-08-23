'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { LancarSegurancaForm } from './LancarSegurancaForm'
import { ExtratoView } from './ExtratoView'

type Tab = 'lancar' | 'extrato'

// Referência estável — ver mesmo comentário em app/extrato/page.tsx.
const ORIGENS_SEGURANCA: ('suporte' | 'seguranca')[] = ['seguranca']

function tabDaUrl(valor: string | null): Tab | null {
  return valor === 'lancar' || valor === 'extrato' ? valor : null
}

export function SegurancaView() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('lancar')

  // Submenu da sidebar linka pra cá com ?tab=X. Precisa reagir a navegação
  // subsequente: trocar de item do submenu não muda de rota (mesma
  // /seguranca, só a query), então o componente não remonta —
  // `useSearchParams` é o único jeito de pegar essa mudança.
  useEffect(() => {
    const daUrl = tabDaUrl(searchParams.get('tab'))
    if (daUrl) setTab(daUrl)
  }, [searchParams])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('seguranca.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('seguranca.subtitulo')}</p>
      </div>

      {tab === 'lancar' && <LancarSegurancaForm />}
      {tab === 'extrato' && <ExtratoView origens={ORIGENS_SEGURANCA} mostrarCategoriaSeguranca mostrarLiberar />}
    </div>
  )
}

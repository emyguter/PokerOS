'use client'
import { useState, useEffect } from 'react'
import { PlusCircle, Receipt, AlertCircle, ClipboardList, Gift } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { LancarForm } from './LancarForm'
import { ExtratoView } from './ExtratoView'
import { PendenciasSuporte } from './PendenciasSuporte'
import { ControlePagamentosView } from './ControlePagamentosView'

type Tab = 'lancar' | 'extrato' | 'pendencias' | 'pagamentos' | 'extra'

const ABAS: { key: Tab; labelKey: string; icon: typeof PlusCircle }[] = [
  { key: 'lancar', labelKey: 'lancamento.aba_lancar', icon: PlusCircle },
  { key: 'extrato', labelKey: 'lancamento.aba_extrato', icon: Receipt },
  { key: 'pendencias', labelKey: 'lancamento.aba_pendencias', icon: AlertCircle },
  { key: 'pagamentos', labelKey: 'lancamento.aba_pagamentos', icon: ClipboardList },
  { key: 'extra', labelKey: 'lancamento.aba_extra', icon: Gift },
]

// Referência estável — ver mesmo comentário em app/extrato/page.tsx sobre
// por que `origens`/arrays de filtro do ExtratoView precisam ser um módulo
// fixo, não um literal recriado a cada render.
const TIPOS_EXTRA = ['bonus', 'promocao', 'outro']

function tabDaUrl(): Tab | null {
  const t = new URLSearchParams(window.location.search).get('tab')
  return t === 'lancar' || t === 'extrato' || t === 'pendencias' || t === 'pagamentos' || t === 'extra' ? t : null
}

export function LancamentoView() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('lancar')

  // Submenu da sidebar linka pra cá com ?tab=X — lido só no mount.
  useEffect(() => {
    const daUrl = tabDaUrl()
    if (daUrl) setTab(daUrl)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('lancamento.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('lancamento.subtitulo')}</p>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        {ABAS.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            <Icon size={14} />{t(labelKey)}
          </button>
        ))}
      </div>

      {tab === 'lancar' && <LancarForm origem="suporte" />}
      {tab === 'extrato' && <ExtratoView />}
      {tab === 'pendencias' && <PendenciasSuporte />}
      {tab === 'pagamentos' && <ControlePagamentosView />}
      {tab === 'extra' && <ExtratoView apenasTipos={TIPOS_EXTRA} apenasConciliados mostrarLiberar />}
    </div>
  )
}

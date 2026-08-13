'use client'
import { useState } from 'react'
import { PlusCircle, Receipt } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { LancarSegurancaForm } from './LancarSegurancaForm'
import { ExtratoView } from './ExtratoView'

type Tab = 'lancar' | 'extrato'

const ABAS: { key: Tab; labelKey: string; icon: typeof PlusCircle }[] = [
  { key: 'lancar', labelKey: 'lancamento.aba_lancar', icon: PlusCircle },
  { key: 'extrato', labelKey: 'lancamento.aba_extrato', icon: Receipt },
]

export function SegurancaView() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('lancar')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('seguranca.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('seguranca.subtitulo')}</p>
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

      {tab === 'lancar' && <LancarSegurancaForm />}
      {tab === 'extrato' && <ExtratoView origens={['seguranca']} mostrarCategoriaSeguranca permitirEdicao={false} />}
    </div>
  )
}

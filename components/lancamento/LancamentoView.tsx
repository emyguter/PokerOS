'use client'
import { useState } from 'react'
import { PlusCircle, Receipt } from 'lucide-react'
import { LancarForm } from './LancarForm'
import { ExtratoView } from './ExtratoView'

export function LancamentoView() {
  const [tab, setTab] = useState<'lancar' | 'extrato'>('lancar')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Lançamento</h1>
        <p className="text-sm text-gray-400 mt-1">Bônus, promoções, caução e pagamentos por clube</p>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setTab('lancar')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'lancar' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
          <PlusCircle size={14} />Lançar
        </button>
        <button
          onClick={() => setTab('extrato')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'extrato' ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'}`}
        >
          <Receipt size={14} />Extrato
        </button>
      </div>

      {tab === 'lancar' ? <LancarForm /> : <ExtratoView />}
    </div>
  )
}

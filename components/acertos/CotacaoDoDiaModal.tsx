'use client'
import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

interface Props {
  moeda: string
  valorAtual: number | null
  saving: boolean
  onConfirm: (valor: number) => void
  onCancel: () => void
}

export function CotacaoDoDiaModal({ moeda, valorAtual, saving, onConfirm, onCancel }: Props) {
  const [valor, setValor] = useState(valorAtual != null ? String(valorAtual) : '')

  function confirmar() {
    const num = Number(valor.replace(',', '.'))
    if (!valor || Number.isNaN(num) || num <= 0) return
    onConfirm(num)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Cotação do dia — {moeda}</h2>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-400">
            Essa liga usa {moeda} com conversão do dia — antes de calcular, confirma qual é a cotação de hoje.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">1 {moeda} = quanto (na moeda do acerto)</label>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={valor}
              onChange={e => setValor(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmar() }}
              placeholder="Ex: 6"
              className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
            />
            {valorAtual != null && <p className="text-xs text-gray-500 mt-1.5">Última cotação registrada: {valorAtual}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onCancel} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}Confirmar e calcular
          </button>
        </div>
      </div>
    </div>
  )
}

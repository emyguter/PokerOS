'use client'
import { Loader2, RotateCcw } from 'lucide-react'

interface Props {
  saving: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmRecalcularModal({ saving, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-gold/10 text-gold"><RotateCcw size={18} /></div>
          <h2 className="text-lg font-semibold text-white">Recalcular acertos</h2>
        </div>
        <p className="text-sm text-gray-400 mb-6">Os itens recalculados serão sobrescritos. Deseja recalcular do zero?</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Não</button>
          <button onClick={onConfirm} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
            {saving && <Loader2 size={14} className="animate-spin" />}Sim
          </button>
        </div>
      </div>
    </div>
  )
}

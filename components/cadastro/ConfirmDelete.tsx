'use client'
import { Loader2, Trash2 } from 'lucide-react'
interface Props { open: boolean; name: string; onConfirm: () => void; onCancel: () => void; saving: boolean }
export function ConfirmDelete({ open, name, onConfirm, onCancel, saving }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-alert/10 text-alert"><Trash2 size={18} /></div>
          <h2 className="text-lg font-semibold text-white">Confirmar exclusão</h2>
        </div>
        <p className="text-sm text-gray-400 mb-6">Tem certeza que deseja excluir <span className="text-white font-medium">"{name}"</span>? Esta ação não pode ser desfeita.</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
          <button onClick={onConfirm} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-alert text-white rounded-lg text-sm font-semibold hover:bg-alert/90 disabled:opacity-50 transition-colors">
            {saving && <Loader2 size={14} className="animate-spin" />}Excluir
          </button>
        </div>
      </div>
    </div>
  )
}

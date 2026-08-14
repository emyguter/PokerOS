'use client'
import { X, Loader2 } from 'lucide-react'

export interface ModalStep {
  key: string
  label: string
}

interface Props {
  open: boolean
  title: string
  steps: ModalStep[]
  active: string
  onStepChange: (key: string) => void
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  saving: boolean
  error?: string | null
  submitLabel?: string
  children: React.ReactNode
  maxWidth?: string
}

// Casca comum pra modais de cadastro com mais de uma seção — cada seção vira
// uma etapa navegável em vez de tudo empilhado num scroll só. Modais de
// entidade simples (poucos campos) podem só não passar `steps` com mais de
// um item, que a barra de etapas nem aparece.
export function StepModal({ open, title, steps, active, onStepChange, onClose, onSubmit, saving, error, submitLabel = 'Salvar', children, maxWidth = 'max-w-2xl' }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative bg-surface border border-white/10 rounded-2xl w-full ${maxWidth} mx-4 shadow-2xl max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        {steps.length > 1 && (
          <div className="flex gap-1 px-6 pt-3 shrink-0 overflow-x-auto border-b border-white/10">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onStepChange(s.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${active === s.key ? 'border-gold text-gold' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              >
                <span className="opacity-60">{i + 1}.</span> {s.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {children}
          </div>
          {error && (
            <div className="shrink-0 mx-6 mb-4 p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>
          )}
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}{submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

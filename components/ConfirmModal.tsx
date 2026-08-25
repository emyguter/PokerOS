'use client'
import { Loader2 } from 'lucide-react'
import type { ReactNode, ComponentType } from 'react'

interface Props {
  open: boolean
  title: string
  description: ReactNode
  onConfirm: () => void
  onCancel: () => void
  saving?: boolean
  confirmDisabled?: boolean
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'gold' | 'alert' | 'amber'
  icon?: ComponentType<{ size?: number; className?: string }>
  error?: string | null
}

const TONE_CLS: Record<NonNullable<Props['tone']>, { badge: string; btn: string }> = {
  gold: { badge: 'bg-gold/10 text-gold', btn: 'bg-gold text-surface hover:bg-gold/90' },
  alert: { badge: 'bg-alert/10 text-alert', btn: 'bg-alert text-white hover:bg-alert/90' },
  amber: { badge: 'bg-amber-500/10 text-amber-500', btn: 'bg-amber-500 text-surface hover:bg-amber-500/90' },
}

// Modal de confirmação padrão da paleta (bg-surface, borda branca 10%,
// blur) — substitui window.confirm() nativo, que mostra a URL do app
// ("poker-os.vercel.app diz") e não segue o visual do resto do sistema.
export function ConfirmModal({ open, title, description, onConfirm, onCancel, saving, confirmDisabled, confirmLabel, cancelLabel, tone = 'gold', icon: Icon, error }: Props) {
  if (!open) return null
  const cls = TONE_CLS[tone]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          {Icon && <div className={`p-2 rounded-lg ${cls.badge}`}><Icon size={18} /></div>}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        <div className="text-sm text-gray-400 mb-6">{description}</div>
        {error && <div className="mb-4 p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">{cancelLabel ?? 'Cancelar'}</button>
          <button onClick={onConfirm} disabled={saving || confirmDisabled} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors ${cls.btn}`}>
            {saving && <Loader2 size={14} className="animate-spin" />}{confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

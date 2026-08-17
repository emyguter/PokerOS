'use client'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface Props {
  saving: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmVipLimiteModal({ saving, onConfirm, onCancel }: Props) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-yellow-400/10 text-yellow-400"><AlertTriangle size={18} /></div>
          <h2 className="text-lg font-semibold text-white">{t('vip.limite_titulo')}</h2>
        </div>
        <p className="text-sm text-gray-400 mb-6">{t('vip.limite_desc')}</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">{t('common.nao')}</button>
          <button onClick={onConfirm} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
            {saving && <Loader2 size={14} className="animate-spin" />}{t('common.sim')}
          </button>
        </div>
      </div>
    </div>
  )
}

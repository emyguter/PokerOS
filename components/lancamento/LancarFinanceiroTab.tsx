'use client'
import { useState } from 'react'
import { Plus, ChevronUp } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { LancarForm } from './LancarForm'
import { FilaValidacao } from './FilaValidacao'

export function LancarFinanceiroTab() {
  const { t } = useI18n()
  const [novoAberto, setNovoAberto] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="rounded-2xl border border-white/10 bg-surface2/50 p-5 space-y-5">
      <div>
        <button
          type="button"
          onClick={() => setNovoAberto(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-gold hover:text-gold/80 transition-colors"
        >
          {novoAberto ? <ChevronUp size={16} /> : <Plus size={16} />}
          {t('lancamento.genia.novo_lancamento')}
        </button>
        {novoAberto && (
          <div className="mt-3">
            <LancarForm origem="genia" onCreated={() => { setRefreshKey(k => k + 1); setNovoAberto(false) }} />
          </div>
        )}
      </div>

      <FilaValidacao refreshKey={refreshKey} />
    </div>
  )
}

'use client'
import { Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useConciliacao } from './useConciliacao'
import { ListaPendencias } from './ListaPendencias'

// Pendência do Financeiro: o Suporte lançou algo que ainda não tem par do
// lado da Genia — falta ela processar/confirmar aquilo.
export function PendenciasFinanceiro() {
  const { t } = useI18n()
  const { dataInicio, setDataInicio, dataFim, setDataFim, loading, error, pendGenia, geniaEntradas, salvarValor, vincular } = useConciliacao()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.de')}</label>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.ate')}</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
      </div>
      <p className="text-xs text-gray-500">{t('conciliacao.pendencias_genia_desc')}</p>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      {loading ? (
        <div className="p-8 text-center text-gray-500 text-sm flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />{t('common.carregando')}</div>
      ) : (
        <ListaPendencias itens={pendGenia} ladoOposto={geniaEntradas} vazio={t('conciliacao.sem_pendencias')} onSalvarValor={salvarValor} onVincular={vincular} />
      )}
    </div>
  )
}

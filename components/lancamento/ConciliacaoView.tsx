'use client'
import { Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { TIPOS } from './ExtratoView'
import { useConciliacao, type LinhaConciliacao, type StatusLinha } from './useConciliacao'

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatData(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}
function valorFmt(v: number, natureza: 'credito' | 'debito') {
  return `${natureza === 'credito' ? '+' : '−'}${formatMoeda(v)}`
}

const ROW_CLS: Record<StatusLinha, string> = {
  conciliado: '',
  divergente: 'bg-alert/5',
  sem_par_suporte: 'bg-gold/5',
  sem_par_genia: 'bg-gold/5',
}

export function ConciliacaoView() {
  const { t } = useI18n()
  const { dataInicio, setDataInicio, dataFim, setDataFim, loading, error, linhas } = useConciliacao()

  return (
    <div className="space-y-6">
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
      <p className="text-xs text-gray-500">{t('conciliacao.janela_nota')}</p>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      {loading ? (
        <div className="p-8 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" />{t('conciliacao.recalculando')}
        </div>
      ) : linhas.length === 0 ? (
        <div className="p-8 text-center text-gray-500 text-sm rounded-xl border border-white/10">{t('conciliacao.sem_pendencias')}</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_data')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('lancamento.clube')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('lancamento.tipo')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('conciliacao.col_suporte')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('conciliacao.col_financeiro')}</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('conciliacao.col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: LinhaConciliacao) => (
                <tr key={l.chave} className={`border-b border-white/5 ${ROW_CLS[l.status]}`}>
                  <td className="px-4 py-3 text-gray-400">{formatData(l.data)}</td>
                  <td className="px-4 py-3 text-gray-200">{l.clube}</td>
                  <td className="px-4 py-3 text-gray-300">{t(TIPOS.find(tp => tp.value === l.tipo)?.labelKey ?? l.tipo)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${l.suporte ? (l.suporte.natureza === 'credito' ? 'text-success' : 'text-alert') : 'text-gray-600'}`}>
                    {l.suporte ? valorFmt(l.suporte.valor, l.suporte.natureza) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${l.genia ? (l.genia.natureza === 'credito' ? 'text-success' : 'text-alert') : 'text-gray-600'}`}>
                    {l.genia ? valorFmt(l.genia.valor, l.genia.natureza) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {l.status === 'conciliado' && <span className="text-xs px-2 py-0.5 rounded-full border border-success/30 bg-success/10 text-success">OK</span>}
                    {l.status === 'divergente' && <span className="text-xs px-2 py-0.5 rounded-full border border-alert/30 bg-alert/10 text-alert">{t('conciliacao.status_divergente')}</span>}
                    {l.status === 'sem_par_genia' && <span className="text-xs px-2 py-0.5 rounded-full border border-gold/30 bg-gold/10 text-gold">{t('conciliacao.status_falta_financeiro')}</span>}
                    {l.status === 'sem_par_suporte' && <span className="text-xs px-2 py-0.5 rounded-full border border-gold/30 bg-gold/10 text-gold">{t('conciliacao.status_falta_suporte')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

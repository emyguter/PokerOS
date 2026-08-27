'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { useConciliacao } from '@/components/lancamento/useConciliacao'
import { ConfirmModal } from '@/components/ConfirmModal'
import { rolloverAcerto } from '@/lib/pagamentos'
import {
  buscarAcertosPendentesDaSemana, buscarInadimplencia,
  type LinhaAcertoPendenteSemana, type InadimplenciaResultado,
} from '@/lib/acertos-pendentes'
import { fmt, StatusBadge, TabelaInadimplencia } from './AcertosPendentesShared'

export function RelatorioAcertosPendentes() {
  const { t } = useI18n()
  const { loading: loadingConciliacao, pendGenia, pendSuporte } = useConciliacao()
  const [semana, setSemana] = useState<LinhaAcertoPendenteSemana[]>([])
  const [inadimplencia, setInadimplencia] = useState<InadimplenciaResultado>({ atrasados: [], inadimplentes: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fazendoRollover, setFazendoRollover] = useState<string | null>(null)
  const [confirmarRollover, setConfirmarRollover] = useState<LinhaAcertoPendenteSemana | null>(null)
  const [erroRollover, setErroRollover] = useState<string | null>(null)

  const totalPendencias = pendGenia.length + pendSuporte.length
  const conciliacaoZerada = !loadingConciliacao && totalPendencias === 0

  const carregar = useCallback(() => {
    setLoading(true); setError(null)
    return Promise.all([buscarAcertosPendentesDaSemana(), buscarInadimplencia()])
      .then(([s, i]) => { setSemana(s); setInadimplencia(i) })
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!conciliacaoZerada) return
    carregar()
  }, [conciliacaoZerada, carregar])

  async function handleRollover() {
    const l = confirmarRollover
    if (!l || !l.clubId) return
    setFazendoRollover(l.acertoId); setErroRollover(null)
    try {
      await rolloverAcerto(l.acertoId, l.clubId, l.diferenca)
      setConfirmarRollover(null)
      await carregar()
    } catch (err) {
      setErroRollover(errMsg(err))
    } finally {
      setFazendoRollover(null)
    }
  }

  if (loadingConciliacao) {
    return <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
  }

  if (!conciliacaoZerada) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <AlertTriangle size={28} className="text-gold" />
        <p className="text-white font-medium">{t('acertos_pendentes.conciliacao_bloqueado_titulo')}</p>
        <p className="text-sm text-gray-500 max-w-md">{t('acertos_pendentes.conciliacao_bloqueado_desc', { n: totalPendencias })}</p>
        <Link href="/financeiro?tab=conciliacao" className="mt-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          {t('acertos_pendentes.ir_para_conciliacao')}
        </Link>
      </div>
    )
  }

  const totalSemana = semana.reduce((acc, l) => ({ acerto: acc.acerto + l.acerto, pago: acc.pago + l.pago, diferenca: acc.diferenca + l.diferenca }), { acerto: 0, pago: 0, diferenca: 0 })

  if (loading) return <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
  if (error) return <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">{t('acertos_pendentes.semana_titulo')}</h2>
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-surface2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_club_id')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_club_name')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_status')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_acerto')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_pago')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_diferenca')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {semana.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">{t('acertos_pendentes.nenhum_pendente_semana')}</td></tr>
                ) : (
                  semana.map((l) => (
                    <tr key={l.clubId || l.clubExternalId} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3 text-gray-400">{l.clubExternalId}</td>
                      <td className="px-4 py-3 text-white">{l.clubName}</td>
                      <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmt(l.acerto)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmt(l.pago)}</td>
                      <td className="px-4 py-3 text-right text-alert font-medium">{fmt(l.diferenca)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {l.clubId && (
                          <button
                            type="button"
                            onClick={() => { setConfirmarRollover(l); setErroRollover(null) }}
                            disabled={fazendoRollover === l.acertoId}
                            title={t('acertos_pendentes.title_rollover')}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gold/30 text-gold rounded-lg text-xs font-medium hover:bg-gold/10 disabled:opacity-50 transition-colors ml-auto"
                          >
                            {fazendoRollover === l.acertoId ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}{t('acertos_pendentes.rollover')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {semana.length > 0 && (
                <tfoot>
                  <tr className="border-t border-white/10 bg-surface2">
                    <td className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={3}>{t('acertos_pendentes.col_total')}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-semibold">{fmt(totalSemana.acerto)}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-semibold">{fmt(totalSemana.pago)}</td>
                    <td className="px-4 py-3 text-right text-alert font-semibold">{fmt(totalSemana.diferenca)}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      <TabelaInadimplencia titulo={t('acertos_pendentes.atrasados_titulo')} linhas={inadimplencia.atrasados} vazio={t('acertos_pendentes.nenhum_atrasado')} />
      <TabelaInadimplencia titulo={t('acertos_pendentes.inadimplentes_titulo')} linhas={inadimplencia.inadimplentes} vazio={t('acertos_pendentes.nenhum_inadimplente')} />

      <ConfirmModal
        open={!!confirmarRollover}
        title={t('acertos_pendentes.rollover')}
        description={confirmarRollover && t('acertos_pendentes.confirm_rollover_desc', { valor: fmt(confirmarRollover.diferenca), nome: confirmarRollover.clubName })}
        tone="gold"
        icon={RotateCcw}
        saving={!!fazendoRollover}
        confirmLabel={t('acertos_pendentes.rollover')}
        error={erroRollover}
        onConfirm={handleRollover}
        onCancel={() => setConfirmarRollover(null)}
      />
    </div>
  )
}

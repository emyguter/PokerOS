'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { useConciliacao } from '@/components/lancamento/useConciliacao'
import {
  buscarAcertosPendentesDaSemana, buscarInadimplencia,
  type LinhaAcertoPendenteSemana, type LinhaInadimplencia, type InadimplenciaResultado, type StatusStoploss,
} from '@/lib/acertos-pendentes'

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_CLS: Record<StatusStoploss, string> = {
  ativo: 'border-success/30 bg-success/10 text-success',
  '50%': 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  bloqueado: 'border-alert/30 bg-alert/10 text-alert',
}

function StatusBadge({ status }: { status: StatusStoploss }) {
  const { t } = useI18n()
  const label = status === 'ativo' ? t('acertos_pendentes.status_ativo') : status === '50%' ? t('acertos_pendentes.status_50') : t('acertos_pendentes.status_bloqueado')
  return <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_CLS[status]}`}>{label}</span>
}

function formatData(data: string): string {
  return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
}

function TabelaInadimplencia({ titulo, linhas, vazio, mostrarTaxa }: { titulo: string; linhas: LinhaInadimplencia[]; vazio: string; mostrarTaxa?: boolean }) {
  const { t } = useI18n()
  const totais = linhas.reduce((acc, l) => ({ divida: acc.divida + l.divida, pago: acc.pago + l.totalPago, pendente: acc.pendente + l.totalPendente }), { divida: 0, pago: 0, pendente: 0 })
  const taxaTotal = totais.divida > 0.005 ? (totais.pago / totais.divida) * 100 : 0

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{titulo}</h2>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_club_id')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_club_name')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_status')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_data')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_divida')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_total_pago')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_total_pendente')}</th>
                {mostrarTaxa && <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_taxa_pagamento')}</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr><td colSpan={mostrarTaxa ? 8 : 7} className="px-4 py-8 text-center text-gray-500 text-sm">{vazio}</td></tr>
              ) : (
                linhas.map((l) => (
                  <tr key={l.clubId} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-gray-400">{l.clubExternalId}</td>
                    <td className="px-4 py-3 text-white">{l.clubName}</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3 text-gray-400">{formatData(l.data)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmt(l.divida)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmt(l.totalPago)}</td>
                    <td className="px-4 py-3 text-right text-alert font-medium">{fmt(l.totalPendente)}</td>
                    {mostrarTaxa && <td className="px-4 py-3 text-right text-gray-400">{l.divida > 0.005 ? `${((l.totalPago / l.divida) * 100).toFixed(1)}%` : '—'}</td>}
                  </tr>
                ))
              )}
            </tbody>
            {linhas.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 bg-surface2">
                  <td className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={4}>{t('acertos_pendentes.col_total')}</td>
                  <td className="px-4 py-3 text-right text-gray-300 font-semibold">{fmt(totais.divida)}</td>
                  <td className="px-4 py-3 text-right text-gray-300 font-semibold">{fmt(totais.pago)}</td>
                  <td className="px-4 py-3 text-right text-alert font-semibold">{fmt(totais.pendente)}</td>
                  {mostrarTaxa && <td className="px-4 py-3 text-right text-gold font-semibold">{taxaTotal.toFixed(2)}%</td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

export function RelatorioAcertosPendentes() {
  const { t } = useI18n()
  const { loading: loadingConciliacao, pendGenia, pendSuporte } = useConciliacao()
  const [semana, setSemana] = useState<LinhaAcertoPendenteSemana[]>([])
  const [inadimplencia, setInadimplencia] = useState<InadimplenciaResultado>({ atrasados: [], inadimplentes: [], historico: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const totalPendencias = pendGenia.length + pendSuporte.length
  const conciliacaoZerada = !loadingConciliacao && totalPendencias === 0

  useEffect(() => {
    if (!conciliacaoZerada) return
    setLoading(true); setError(null)
    Promise.all([buscarAcertosPendentesDaSemana(), buscarInadimplencia()])
      .then(([s, i]) => { setSemana(s); setInadimplencia(i) })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [conciliacaoZerada])

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
                </tr>
              </thead>
              <tbody>
                {semana.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">{t('acertos_pendentes.nenhum_pendente_semana')}</td></tr>
                ) : (
                  semana.map((l) => (
                    <tr key={l.clubId || l.clubExternalId} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3 text-gray-400">{l.clubExternalId}</td>
                      <td className="px-4 py-3 text-white">{l.clubName}</td>
                      <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmt(l.acerto)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmt(l.pago)}</td>
                      <td className="px-4 py-3 text-right text-alert font-medium">{fmt(l.diferenca)}</td>
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
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      <TabelaInadimplencia titulo={t('acertos_pendentes.atrasados_titulo')} linhas={inadimplencia.atrasados} vazio={t('acertos_pendentes.nenhum_atrasado')} />
      <TabelaInadimplencia titulo={t('acertos_pendentes.inadimplentes_titulo')} linhas={inadimplencia.inadimplentes} vazio={t('acertos_pendentes.nenhum_inadimplente')} />
      <TabelaInadimplencia titulo={t('acertos_pendentes.historico_titulo')} linhas={inadimplencia.historico} vazio={t('acertos_pendentes.nenhum_historico')} mostrarTaxa />
    </div>
  )
}

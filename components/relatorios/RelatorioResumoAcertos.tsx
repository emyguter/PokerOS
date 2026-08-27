'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { buscarResumoAcertos, buscarPeriodosAcerto, type LinhaResumoAcerto, type PeriodoAcerto } from '@/lib/relatorio-resumo-acertos'
import { LABEL_SETTLEMENT } from '@/lib/types'
import { errMsg } from '@/lib/errors'
import { useI18n } from '@/lib/i18n'

function formatPeriodo(p: PeriodoAcerto): string {
  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${fmtD(p.inicio)} → ${fmtD(p.fim)}`
}

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Valor({ v, corNeutraSeZero }: { v: number; corNeutraSeZero?: boolean }) {
  if (corNeutraSeZero && v === 0) return <span className="text-gray-700">—</span>
  return <span className={v > 0 ? 'text-emerald-400' : v < 0 ? 'text-alert' : 'text-gray-300'}>{fmt(v)}</span>
}

export function RelatorioResumoAcertos() {
  const { t } = useI18n()
  const [linhas, setLinhas] = useState<LinhaResumoAcerto[]>([])
  const [periodos, setPeriodos] = useState<PeriodoAcerto[]>([])
  const [periodoFiltro, setPeriodoFiltro] = useState('')
  const [projetoFiltro, setProjetoFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    buscarPeriodosAcerto().then((lista) => {
      setPeriodos(lista)
      if (lista.length > 0) setPeriodoFiltro(lista[0].fim)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!periodoFiltro) return
    setLoading(true); setError(null)
    buscarResumoAcertos(periodoFiltro)
      .then(setLinhas)
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false))
  }, [periodoFiltro])

  const projetos = useMemo(() => [...new Set(linhas.map((l) => l.projeto).filter((p): p is string => !!p))].sort(), [linhas])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas
      .filter((l) => !projetoFiltro || l.projeto === projetoFiltro)
      .filter((l) => !q || l.clubName.toLowerCase().includes(q) || l.membros.some((m) => m.externalId.includes(q)))
  }, [linhas, projetoFiltro, busca])

  // Peso = fatia desse clube sobre o total de Fee cobrado na semana (só
  // entre os clubes filtrados) — mesma ideia da coluna "Peso" da planilha
  // do Cássio (proporção do Fee, não do Rake).
  const totalFeeAbs = filtradas.reduce((s, l) => s + Math.abs(l.unionFee), 0)
  const pesoDe = (l: LinhaResumoAcerto) => (totalFeeAbs > 0 ? (Math.abs(l.unionFee) / totalFeeAbs) * 100 : 0)

  const totais = filtradas.reduce(
    (acc, l) => ({
      rake: acc.rake + l.rakeTotal,
      fee: acc.fee + l.unionFee,
      operacional: acc.operacional + l.operacional,
      winnings: acc.winnings + l.winnings,
      tickets: acc.tickets + l.tickets,
      security: acc.security + l.security,
      extras: acc.extras + l.extras,
      fines: acc.fines + l.fines,
      spinup: acc.spinup + l.spinupPnl,
      referral: acc.referral + l.referral,
    }),
    { rake: 0, fee: 0, operacional: 0, winnings: 0, tickets: 0, security: 0, extras: 0, fines: 0, spinup: 0, referral: 0 }
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {t('relatorio_resumo_acertos.desc')}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t('relatorio_resumo_acertos.buscar_clube_placeholder')}
            className="w-full bg-surface border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
          />
        </div>
        <select
          value={projetoFiltro}
          onChange={(e) => setProjetoFiltro(e.target.value)}
          className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
        >
          <option value="">{t('relatorio_resumo_acertos.todos_projetos')}</option>
          {projetos.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {periodos.length > 0 && (
          <select
            value={periodoFiltro}
            onChange={(e) => setPeriodoFiltro(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            {periodos.map((p) => <option key={p.fim} value={p.fim}>{t('relatorio_resumo_acertos.semana_label', { periodo: formatPeriodo(p) })}</option>)}
          </select>
        )}
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_projeto')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_clube')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_liga')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_modelo')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_rake')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_fee')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_pct_fee')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_peso')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_operacional')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_ganhos_perdas')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('club_acerto_card.bilhetes_label')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('club_acerto_card.seguranca_label')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_extras')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_multas')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_spinup_pnl')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_resumo_acertos.col_indicacao')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={16} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.carregando')}</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={16} className="px-4 py-8 text-center text-gray-500 text-sm">{t('relatorio_resumo_acertos.nenhum_acerto')}</td></tr>
              ) : (
                filtradas.map((l) => (
                  <tr key={l.clubId || l.clubExternalId} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-gray-400">{l.projeto ?? '—'}</td>
                    <td className="px-4 py-3 text-white">
                      {l.clubName}
                      {l.membros.length > 1 ? (
                        l.membros.map((m) => (
                          <span key={m.externalId} className="block text-gray-600 text-xs">{m.nome} · {m.externalId}</span>
                        ))
                      ) : (
                        <span className="block text-gray-600 text-xs">{l.clubExternalId}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{l.ligaNome ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{LABEL_SETTLEMENT[l.settlementType] ?? l.settlementType}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmt(l.rakeTotal)}</td>
                    <td className="px-4 py-3 text-right text-gold">{fmt(l.unionFee)}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{l.pctUnion.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-gray-500">{pesoDe(l).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right"><Valor v={-l.operacional} corNeutraSeZero /></td>
                    <td className="px-4 py-3 text-right"><Valor v={l.winnings} corNeutraSeZero /></td>
                    <td className="px-4 py-3 text-right"><Valor v={l.tickets} corNeutraSeZero /></td>
                    <td className="px-4 py-3 text-right"><Valor v={l.security} corNeutraSeZero /></td>
                    <td className="px-4 py-3 text-right"><Valor v={l.extras} corNeutraSeZero /></td>
                    <td className="px-4 py-3 text-right"><Valor v={-l.fines} corNeutraSeZero /></td>
                    <td className="px-4 py-3 text-right"><Valor v={l.spinupPnl} corNeutraSeZero /></td>
                    <td className="px-4 py-3 text-right"><Valor v={l.referral} corNeutraSeZero /></td>
                  </tr>
                ))
              )}
            </tbody>
            {filtradas.length > 0 && (
              <tfoot>
                <tr className="border-t border-white/10 bg-surface2">
                  <td className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={4}>{t('relatorio_resumo_acertos.total_label', { n: filtradas.length })}</td>
                  <td className="px-4 py-3 text-right text-gray-300 font-semibold">{fmt(totais.rake)}</td>
                  <td className="px-4 py-3 text-right text-gold font-semibold">{fmt(totais.fee)}</td>
                  <td colSpan={2}></td>
                  <td className="px-4 py-3 text-right font-semibold"><Valor v={-totais.operacional} /></td>
                  <td className="px-4 py-3 text-right font-semibold"><Valor v={totais.winnings} /></td>
                  <td className="px-4 py-3 text-right font-semibold"><Valor v={totais.tickets} /></td>
                  <td className="px-4 py-3 text-right font-semibold"><Valor v={totais.security} /></td>
                  <td className="px-4 py-3 text-right font-semibold"><Valor v={totais.extras} /></td>
                  <td className="px-4 py-3 text-right font-semibold"><Valor v={-totais.fines} /></td>
                  <td className="px-4 py-3 text-right font-semibold"><Valor v={totais.spinup} /></td>
                  <td className="px-4 py-3 text-right font-semibold"><Valor v={totais.referral} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

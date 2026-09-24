'use client'
import { useState, useEffect, useCallback } from 'react'
import { buscarTaxaApp, type TaxaAppLinha } from '@/lib/taxa-app'
import { buscarPeriodosAcerto, type PeriodoAcerto } from '@/lib/relatorio-resumo-acertos'
import { errMsg } from '@/lib/errors'
import { useI18n } from '@/lib/i18n'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const LABEL_TIPO: Record<TaxaAppLinha['entidadeTipo'], string> = { clube: 'Clube', liga: 'Liga', superliga: 'SuperLiga' }

// Quanto a operação deve pro APP (PokerOS) — Regra de faixa vinculada num
// Clube, Liga ou SuperLiga (campo='taxa_app', ver lib/taxa-app.ts), somando
// o Rake Total de todo clube do escopo daquela entidade na semana. Pedido
// do Cássio: "o uso do app tem um custo que pagamos pro app... penso que
// pode ser criado sub menus abaixo de acertos" — Acertos → Taxa App.
export function TaxaAppView() {
  const { t } = useI18n()
  const [periodos, setPeriodos] = useState<PeriodoAcerto[]>([])
  const [periodoFiltro, setPeriodoFiltro] = useState('')
  const [linhas, setLinhas] = useState<TaxaAppLinha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (periodoFim: string) => {
    setLoading(true); setError(null)
    try { setLinhas(await buscarTaxaApp(periodoFim)) }
    catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    buscarPeriodosAcerto().then((lista) => {
      setPeriodos(lista)
      if (lista.length > 0) { setPeriodoFiltro(lista[0].fim); load(lista[0].fim) }
      else setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function mudarPeriodo(fim: string) {
    setPeriodoFiltro(fim)
    load(fim)
  }

  const totalRake = linhas.reduce((s, l) => s + l.rakeTotal, 0)
  const totalDevido = linhas.reduce((s, l) => s + (l.valorDevido ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-400">{t('taxa_app.legenda')}</p>
        {periodos.length > 0 && (
          <select
            value={periodoFiltro}
            onChange={(e) => mudarPeriodo(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            {periodos.map((p) => (
              <option key={p.fim} value={p.fim}>
                {t('taxa_app.semana_label')}: {new Date(p.inicio + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} → {new Date(p.fim + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500 italic text-center py-8">{t('common.carregando')}</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-gray-500 italic text-center py-8">{t('taxa_app.vazio')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="rounded-xl border border-white/10 bg-surface2 px-4 py-3">
              <p className="text-xs text-gray-500">{t('taxa_app.col_rake_total')}</p>
              <p className="text-base font-semibold text-white">{fmt(totalRake)}</p>
            </div>
            <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
              <p className="text-xs text-gold">{t('taxa_app.total_devido')}</p>
              <p className="text-base font-semibold text-gold">{fmt(totalDevido)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-surface2">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('taxa_app.col_tipo')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('taxa_app.col_entidade')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('taxa_app.col_regra')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('taxa_app.col_clubes')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('taxa_app.col_rake_total')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('taxa_app.col_pct')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('taxa_app.col_valor_devido')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {linhas.map((l) => (
                    <tr key={l.vinculoId} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-gray-400">{LABEL_TIPO[l.entidadeTipo]}</td>
                      <td className="px-4 py-3 text-white">{l.entidadeNome}</td>
                      <td className="px-4 py-3 text-gray-400">{l.regraNome}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{l.clubesNoEscopo}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmt(l.rakeTotal)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{l.pctAplicado == null ? '—' : `${l.pctAplicado}%`}</td>
                      <td className="px-4 py-3 text-right text-gold font-medium">{l.valorDevido == null ? '—' : fmt(l.valorDevido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

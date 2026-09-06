'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { BuscaSelect } from '@/components/BuscaSelect'
import { buscarDividasHistorico, type LinhaDividaHistorico } from '@/lib/dividas-historico'
import { fmt, formatData } from './AcertosPendentesShared'

interface ClubeOpcao { id: string; name: string }

// "Histórico de Dívidas" — planilha manual do Cássio (2021-2026), importada
// como estava: mesmo agrupamento por ano com subtotal "TOTAL ANUAL", mesmas
// colunas (Status/Obs em texto livre, "Start to Pay" nem sempre é uma data).
// Só leitura — não é a mesma coisa que Dívidas/Acordos (tela de dívida
// ativa com parcela) nem o relatório "Histórico de Acertos Pendentes"
// (esse é calculado ao vivo em cima de acertos/lancamentos, não alcança
// clubes/anos de antes do sistema rastrear isso).
export function RelatorioDividasHistorico() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState('')
  const [liga, setLiga] = useState<'' | 'LP' | 'ORION'>('')
  const [linhas, setLinhas] = useState<LinhaDividaHistorico[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [obsAberta, setObsAberta] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes((data ?? []) as ClubeOpcao[]))
  }, [])

  useEffect(() => {
    setLoading(true); setError(null)
    buscarDividasHistorico({ clubeId: clubeId || undefined, liga: liga || undefined })
      .then(setLinhas)
      .catch((e) => setError(errMsg(e)))
      .finally(() => setLoading(false))
  }, [clubeId, liga])

  const porAno = useMemo(() => {
    const grupos = new Map<number, LinhaDividaHistorico[]>()
    for (const l of linhas) {
      const lista = grupos.get(l.ano) ?? []
      lista.push(l)
      grupos.set(l.ano, lista)
    }
    return [...grupos.entries()].sort((a, b) => b[0] - a[0])
  }, [linhas])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.clube')}</label>
          <BuscaSelect
            value={clubeId}
            onChange={setClubeId}
            opcoes={clubes.map((c) => ({ id: c.id, nome: c.name }))}
            placeholder={t('relatorios.todos_clubes')}
            vazio={t('relatorios.todos_clubes')}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('dividas_historico.liga_planilha')}</label>
          <select value={liga} onChange={(e) => setLiga(e.target.value as '' | 'LP' | 'ORION')} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            <option value="">{t('relatorios.todos_clubes')}</option>
            <option value="LP">Liga Particular</option>
            <option value="ORION">ORION</option>
          </select>
        </div>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.carregando')}</p>
      ) : porAno.length === 0 ? (
        <p className="text-sm text-gray-500 italic">{t('dividas_historico.nenhum')}</p>
      ) : (
        porAno.map(([ano, linhasAno]) => {
          const totais = linhasAno.reduce((acc, l) => ({ debet: acc.debet + l.debet, pago: acc.pago + l.pago, total: acc.total + l.total }), { debet: 0, pago: 0, total: 0 })
          return (
            <div key={ano} className="space-y-3">
              <h2 className="text-lg font-semibold text-white">{ano}</h2>
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-surface2">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('dividas_historico.col_data')}</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('dividas_historico.col_clube')}</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('acertos_pendentes.col_status')}</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('dividas_historico.col_debet')}</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('acertos_pendentes.col_pago')}</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('acertos_pendentes.col_total')}</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t('dividas_historico.col_start_to_pay')}</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('dividas_historico.col_obs')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {linhasAno.map((l) => (
                        <tr key={l.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{formatData(l.data)}</td>
                          <td className="px-3 py-2 text-white whitespace-nowrap">
                            {l.clubName}
                            {!l.clubeId && <span className="ml-1.5 text-[10px] text-gray-600" title={t('dividas_historico.sem_vinculo_desc')}>({t('dividas_historico.sem_vinculo')})</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{l.status ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.debet)}</td>
                          <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.pago)}</td>
                          <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${l.total < -0.005 ? 'text-alert' : l.total > 0.005 ? 'text-success' : 'text-gray-400'}`}>{fmt(l.total)}</td>
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{l.startToPay ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-400 max-w-xs">
                            {l.obs ? (
                              <button type="button" onClick={() => setObsAberta(obsAberta === l.id ? null : l.id)} className="text-left hover:text-white transition-colors">
                                <span className={obsAberta === l.id ? '' : 'line-clamp-1'}>{l.obs}</span>
                              </button>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-surface2">
                        <td className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider" colSpan={3}>{t('dividas_historico.total_anual')}</td>
                        <td className="px-3 py-2 text-right text-gray-300 font-semibold whitespace-nowrap">{fmt(totais.debet)}</td>
                        <td className="px-3 py-2 text-right text-gray-300 font-semibold whitespace-nowrap">{fmt(totais.pago)}</td>
                        <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${totais.total < 0 ? 'text-alert' : 'text-success'}`}>{fmt(totais.total)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

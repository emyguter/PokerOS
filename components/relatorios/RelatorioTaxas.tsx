'use client'
import { useState, useEffect, useCallback } from 'react'
import { buscarResumoTaxas, type ResumoTaxaClube, type TaxaCampoResumo } from '@/lib/relatorio-taxas'
import { LABEL_SETTLEMENT } from '@/lib/types'
import { errMsg } from '@/lib/errors'
import { useI18n } from '@/lib/i18n'

function Celula({ campo }: { campo: TaxaCampoResumo | null }) {
  const { t } = useI18n()
  if (!campo) return <span className="text-gray-700">—</span>
  return (
    <span className={campo.variavel ? 'text-gold' : 'text-gray-300'} title={campo.variavel ? t('relatorio_taxas.title_variavel') : t('relatorio_taxas.title_fixo')}>
      {campo.valor}
    </span>
  )
}

function CelulaPct({ v }: { v: number | null }) {
  return v == null ? <span className="text-gray-700">—</span> : <span className="text-gray-300">{v}%</span>
}

export function RelatorioTaxas() {
  const { t } = useI18n()
  const [linhas, setLinhas] = useState<ResumoTaxaClube[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setLinhas(await buscarResumoTaxas()) }
    catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {t('relatorio_taxas.legenda_prefix')} <span className="text-gold">{t('relatorio_taxas.legenda_dourado')}</span>{t('relatorio_taxas.legenda_suffix')}
      </p>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_taxas.col_id')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_taxas.col_clube')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_taxas.col_tipo_cobranca')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('regra_modal.campo_fee_mtt')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('regra_modal.campo_fee_cash')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('regra_modal.campo_taxa_op')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('regra_modal.campo_spinup')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('regra_modal.campo_taxa_liga')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_taxas.col_rebate')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_taxas.col_crypto_rebate')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_taxas.col_rakeback')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorio_taxas.col_termos_especiais')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.carregando')}</td></tr>
              ) : linhas.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-500 text-sm">{t('relatorio_taxas.nenhum_clube_ativo')}</td></tr>
              ) : (
                linhas.map(l => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-gray-500">{l.externalId ?? '—'}</td>
                    <td className="px-4 py-3 text-white">{l.nome}</td>
                    <td className="px-4 py-3 text-gray-400">{LABEL_SETTLEMENT[l.settlementType] ?? l.settlementType}</td>
                    <td className="px-4 py-3"><Celula campo={l.feeMtt} /></td>
                    <td className="px-4 py-3"><Celula campo={l.feeCash} /></td>
                    <td className="px-4 py-3"><Celula campo={l.taxaOperacional} /></td>
                    <td className="px-4 py-3"><Celula campo={l.spinup} /></td>
                    <td className="px-4 py-3"><Celula campo={l.taxaLiga} /></td>
                    <td className="px-4 py-3"><CelulaPct v={l.rebatePct} /></td>
                    <td className="px-4 py-3"><CelulaPct v={l.cryptoRebatePct} /></td>
                    <td className="px-4 py-3"><CelulaPct v={l.rakebackPct} /></td>
                    <td className="px-4 py-3 max-w-[220px] truncate text-gray-300" title={l.termosEspeciais ?? undefined}>
                      {l.termosEspeciais ?? <span className="text-gray-700">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

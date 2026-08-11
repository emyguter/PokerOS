'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { BuscaSelect } from '@/components/BuscaSelect'
import type { StoplossHistoricoItem, StoplossHistoricoTipo } from '@/lib/types'

interface ClubeOpcao { id: string; name: string }

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TIPO_LABEL: Record<StoplossHistoricoTipo, string> = {
  inicial: 'stoploss.tipo_inicial',
  antecipacao: 'stoploss.tipo_antecipacao',
  ajuste_suporte: 'stoploss.tipo_ajuste',
  caucao: 'stoploss.tipo_caucao',
  margem_monitoria: 'stoploss.tipo_margem',
}

export function ExtratoStoploss() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState('')
  const [itens, setItens] = useState<StoplossHistoricoItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes(data ?? []))
  }, [])

  const load = useCallback(async () => {
    if (!clubeId) { setItens([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('stoploss_historico')
      .select('id, clube_id, tipo, valor_delta, valor_resultante, motivo, criado_em')
      .eq('clube_id', clubeId)
      .order('criado_em', { ascending: false })
    setItens((data ?? []) as StoplossHistoricoItem[])
    setLoading(false)
  }, [clubeId])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="max-w-xs">
        <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.clube')}</label>
        <BuscaSelect
          value={clubeId}
          onChange={setClubeId}
          opcoes={clubes.map(c => ({ id: c.id, nome: c.name }))}
          placeholder={t('common.selecione')}
        />
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        {!clubeId ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('stoploss.selecione_clube')}</div>
        ) : loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
        ) : itens.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('stoploss.historico_vazio')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-surface2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.col_data')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.col_tipo')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.col_motivo')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.col_delta')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('stoploss.col_resultante')}</th>
                </tr>
              </thead>
              <tbody>
                {itens.map(i => (
                  <tr key={i.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-gray-400">{new Date(i.criado_em).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-gray-300">{t(TIPO_LABEL[i.tipo])}</td>
                    <td className="px-4 py-3 text-gray-400">{i.motivo || '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${i.valor_delta >= 0 ? 'text-success' : 'text-alert'}`}>{i.valor_delta >= 0 ? '+' : ''}{formatMoeda(i.valor_delta)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{formatMoeda(i.valor_resultante)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

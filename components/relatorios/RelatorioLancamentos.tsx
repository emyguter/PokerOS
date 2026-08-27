'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { BuscaSelectMulti } from '@/components/BuscaSelectMulti'
import { TIPOS } from '@/components/lancamento/ExtratoView'

interface ClubeOpcao { id: string; name: string }

interface Lancamento {
  id: string
  clube_id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  origem: 'suporte' | 'genia' | 'seguranca'
  status: string | null
  clubs: { name: string } | null
}

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function trintaDiasAtras() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const LABEL_ORIGEM: Record<string, string> = { suporte: 'Suporte', genia: 'Financeiro', seguranca: 'Segurança' }
const LABEL_STATUS: Record<string, string> = { em_validacao: 'Em validação', pago: 'Pago' }

export function RelatorioLancamentos() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeIds, setClubeIds] = useState<string[]>([])
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [naturezaFiltro, setNaturezaFiltro] = useState('')
  const [origemFiltro, setOrigemFiltro] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [dataInicio, setDataInicio] = useState(trintaDiasAtras())
  const [dataFim, setDataFim] = useState(hoje())
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes(data ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('lancamentos')
      .select('id, clube_id, tipo, natureza, valor, descricao, data_lancamento, origem, status, clubs(name)')
      .order('data_lancamento', { ascending: false })
      .limit(500)
    if (clubeIds.length > 0) query = query.in('clube_id', clubeIds)
    if (tipoFiltro) query = query.eq('tipo', tipoFiltro)
    if (naturezaFiltro) query = query.eq('natureza', naturezaFiltro)
    if (origemFiltro) query = query.eq('origem', origemFiltro)
    if (statusFiltro) query = query.eq('status', statusFiltro)
    if (dataInicio) query = query.gte('data_lancamento', dataInicio)
    if (dataFim) query = query.lte('data_lancamento', dataFim)
    const { data } = await query
    setLancamentos((data ?? []) as unknown as Lancamento[])
    setLoading(false)
  }, [clubeIds, tipoFiltro, naturezaFiltro, origemFiltro, statusFiltro, dataInicio, dataFim])

  useEffect(() => { load() }, [load])

  const totais = useMemo(() => lancamentos.reduce((acc, l) => {
    if (l.natureza === 'credito') acc.credito += l.valor
    else acc.debito += l.valor
    return acc
  }, { credito: 0, debito: 0 }), [lancamentos])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-2">
          <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.clube')}</label>
          <BuscaSelectMulti value={clubeIds} onChange={setClubeIds} opcoes={clubes.map(c => ({ id: c.id, nome: c.name }))} placeholder={t('relatorios.todos_clubes')} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.tipo')}</label>
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            <option value="">{t('extrato.todos')}</option>
            {TIPOS.map(tp => <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('relatorios.natureza')}</label>
          <select value={naturezaFiltro} onChange={e => setNaturezaFiltro(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            <option value="">{t('extrato.todos')}</option>
            <option value="credito">{t('lancamento.credito')}</option>
            <option value="debito">{t('lancamento.debito')}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('relatorios.origem')}</label>
          <select value={origemFiltro} onChange={e => setOrigemFiltro(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            <option value="">{t('extrato.todos')}</option>
            <option value="suporte">{t('conciliacao.col_suporte')}</option>
            <option value="genia">{t('conciliacao.col_financeiro')}</option>
            <option value="seguranca">{t('nav.seguranca')}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('relatorios.status')}</label>
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            <option value="">{t('extrato.todos')}</option>
            <option value="em_validacao">{LABEL_STATUS.em_validacao}</option>
            <option value="pago">{LABEL_STATUS.pago}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.de')}</label>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.ate')}</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-surface2 p-4 flex items-center gap-3">
          <ArrowUpCircle className="text-success shrink-0" size={22} />
          <div>
            <p className="text-xs text-gray-500">{t('extrato.creditos')}</p>
            <p className="text-lg font-semibold text-success">{formatMoeda(totais.credito)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface2 p-4 flex items-center gap-3">
          <ArrowDownCircle className="text-alert shrink-0" size={22} />
          <div>
            <p className="text-xs text-gray-500">{t('extrato.debitos')}</p>
            <p className="text-lg font-semibold text-alert">{formatMoeda(totais.debito)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 flex items-center gap-3">
          <Wallet className="text-gold shrink-0" size={22} />
          <div>
            <p className="text-xs text-gray-500">{t('extrato.saldo')}</p>
            <p className={`text-lg font-semibold ${totais.credito - totais.debito >= 0 ? 'text-gold' : 'text-alert'}`}>{formatMoeda(totais.credito - totais.debito)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_data')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('lancamento.clube')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_tipo')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorios.origem')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('relatorios.status')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_descricao')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_valor')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.carregando')}</td></tr>
              ) : lancamentos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">{t('common.nenhum_registro')}</td></tr>
              ) : (
                lancamentos.map(l => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-gray-400">{new Date(l.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-white">{l.clubs?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{t(TIPOS.find(tp => tp.value === l.tipo)?.labelKey ?? l.tipo)}</td>
                    <td className="px-4 py-3 text-gray-400">{LABEL_ORIGEM[l.origem] ?? l.origem}</td>
                    <td className="px-4 py-3 text-gray-400">{l.status ? LABEL_STATUS[l.status] ?? l.status : '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{l.descricao || '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${l.natureza === 'credito' ? 'text-success' : 'text-alert'}`}>
                      {l.natureza === 'credito' ? '+' : '−'}{formatMoeda(l.valor)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {lancamentos.length === 500 && <p className="text-xs text-gray-500">{t('relatorios.limite_500')}</p>}
    </div>
  )
}

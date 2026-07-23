'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

export const TIPOS = [
  { value: 'bonus', labelKey: 'lancamento.tipos.bonus' },
  { value: 'promocao', labelKey: 'lancamento.tipos.promocao' },
  { value: 'caucao', labelKey: 'lancamento.tipos.caucao' },
  { value: 'pagamento', labelKey: 'lancamento.tipos.pagamento' },
  { value: 'outro', labelKey: 'lancamento.tipos.outro' },
] as const

interface Lancamento {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  created_at: string
}

interface ClubeOpcao { id: string; name: string }

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ExtratoView({ clubeIdFixo }: { clubeIdFixo?: string }) {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState(clubeIdFixo ?? '')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (clubeIdFixo) return
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes(data ?? []))
  }, [clubeIdFixo])

  const load = useCallback(async () => {
    if (!clubeId) { setLancamentos([]); return }
    setLoading(true)
    let query = supabase
      .from('lancamentos')
      .select('id, tipo, natureza, valor, descricao, data_lancamento, created_at')
      .eq('clube_id', clubeId)
      .order('data_lancamento', { ascending: true })
      .order('created_at', { ascending: true })
    if (tipoFiltro) query = query.eq('tipo', tipoFiltro)
    if (dataInicio) query = query.gte('data_lancamento', dataInicio)
    if (dataFim) query = query.lte('data_lancamento', dataFim)
    const { data } = await query
    setLancamentos(data ?? [])
    setLoading(false)
  }, [clubeId, tipoFiltro, dataInicio, dataFim])

  useEffect(() => { load() }, [load])

  const linhas = useMemo(() => {
    let saldo = 0
    return lancamentos.map((l) => {
      saldo += l.natureza === 'credito' ? l.valor : -l.valor
      return { ...l, saldo }
    })
  }, [lancamentos])

  const totalCredito = lancamentos.filter((l) => l.natureza === 'credito').reduce((s, l) => s + l.valor, 0)
  const totalDebito = lancamentos.filter((l) => l.natureza === 'debito').reduce((s, l) => s + l.valor, 0)
  const saldoFinal = totalCredito - totalDebito

  return (
    <div className="space-y-5">
      {!clubeIdFixo && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.clube')}</label>
            <select value={clubeId} onChange={(e) => setClubeId(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
              <option value="">{t('common.selecione')}</option>
              {clubes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.tipo')}</label>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
              <option value="">{t('extrato.todos')}</option>
              {TIPOS.map((tp) => <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.de')}</label>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-2 py-2.5 text-white text-xs focus:outline-none focus:border-gold/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.ate')}</label>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-2 py-2.5 text-white text-xs focus:outline-none focus:border-gold/50" />
            </div>
          </div>
        </div>
      )}

      {clubeIdFixo && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.tipo')}</label>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
              <option value="">{t('extrato.todos')}</option>
              {TIPOS.map((tp) => <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.de')}</label>
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-2 py-2.5 text-white text-xs focus:outline-none focus:border-gold/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.ate')}</label>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-2 py-2.5 text-white text-xs focus:outline-none focus:border-gold/50" />
            </div>
          </div>
        </div>
      )}

      {clubeId && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-surface2 p-4 flex items-center gap-3">
            <ArrowUpCircle className="text-success shrink-0" size={22} />
            <div>
              <p className="text-xs text-gray-500">{t('extrato.creditos')}</p>
              <p className="text-lg font-semibold text-success">{formatMoeda(totalCredito)}</p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-surface2 p-4 flex items-center gap-3">
            <ArrowDownCircle className="text-alert shrink-0" size={22} />
            <div>
              <p className="text-xs text-gray-500">{t('extrato.debitos')}</p>
              <p className="text-lg font-semibold text-alert">{formatMoeda(totalDebito)}</p>
            </div>
          </div>
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 flex items-center gap-3">
            <Wallet className="text-gold shrink-0" size={22} />
            <div>
              <p className="text-xs text-gray-500">{t('extrato.saldo')}</p>
              <p className={`text-lg font-semibold ${saldoFinal >= 0 ? 'text-gold' : 'text-alert'}`}>{formatMoeda(saldoFinal)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        {!clubeId ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('extrato.selecione_clube')}</div>
        ) : loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
        ) : linhas.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('extrato.nenhum_periodo')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-surface2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_data')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_tipo')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_descricao')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_valor')}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_saldo')}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-gray-400">{new Date(l.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-gray-300">{t(TIPOS.find((tp) => tp.value === l.tipo)?.labelKey ?? l.tipo)}</td>
                    <td className="px-4 py-3 text-gray-400">{l.descricao || '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${l.natureza === 'credito' ? 'text-success' : 'text-alert'}`}>
                      {l.natureza === 'credito' ? '+' : '−'}{formatMoeda(l.valor)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{formatMoeda(l.saldo)}</td>
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

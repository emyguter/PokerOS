'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import { buscarPeriodosComAcerto, buscarPagamentosPorPeriodo, corDiferenca, diferencaDaLiga, type PeriodoPagamento, type AcertoPagamento } from '@/lib/pagamentos'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const COR_CLASSE: Record<ReturnType<typeof corDiferenca>, string> = {
  quitado: 'text-gray-400',
  azul: 'text-blue-400',
  vermelho: 'text-alert',
}

function formatPeriodoLabel(p: PeriodoPagamento) {
  return `${p.inicio} → ${p.fim}`
}

// Financeiro vê o total pago, não cada Envio individual — mesmos dados que
// ControlePagamentosView (Suporte), só que somados. Sinal E cor da Diferença
// são invertidos em relação ao Suporte: aqui é do ponto de vista da liga (o
// que a liga precisa pagar/receber), não do clube — ver diferencaDaLiga em
// lib/pagamentos.ts. Seletor é por semana (uma vez só cada period_end, não
// um import por Liga) — ver buscarPeriodosComAcerto.
export function CobrancaView() {
  const { t } = useI18n()
  const [periodos, setPeriodos] = useState<PeriodoPagamento[]>([])
  const [periodoFim, setPeriodoFim] = useState('')
  const [clubeFiltro, setClubeFiltro] = useState('')
  const [projetoFiltro, setProjetoFiltro] = useState('')
  const [linhas, setLinhas] = useState<AcertoPagamento[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    buscarPeriodosComAcerto().then((lista) => {
      setPeriodos(lista)
      if (lista[0]) setPeriodoFim(lista[0].fim)
    })
  }, [])

  const periodoSelecionado = useMemo(() => periodos.find((p) => p.fim === periodoFim) ?? null, [periodos, periodoFim])

  const load = useCallback(async (periodo: PeriodoPagamento | null) => {
    if (!periodo) { setLinhas([]); return }
    setLoading(true)
    setLinhas(await buscarPagamentosPorPeriodo(periodo.inicio, periodo.fim))
    setLoading(false)
  }, [])

  useEffect(() => { load(periodoSelecionado) }, [periodoSelecionado, load])

  const projetosDisponiveis = useMemo(
    () => [...new Set(linhas.map((l) => l.projeto).filter((p): p is string => !!p))].sort(),
    [linhas]
  )
  const linhasFiltradas = useMemo(() => {
    const busca = clubeFiltro.trim().toLowerCase()
    return linhas.filter((l) =>
      (!projetoFiltro || l.projeto === projetoFiltro) &&
      (!busca || l.club_name.toLowerCase().includes(busca))
    )
  }, [linhas, projetoFiltro, clubeFiltro])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('cobranca.titulo')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('cobranca.subtitulo')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('pagamentos.import')}</label>
          <select value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            {periodos.length === 0 && <option value="">{t('pagamentos.nenhum_import')}</option>}
            {periodos.map((p) => <option key={p.fim} value={p.fim}>{formatPeriodoLabel(p)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.clube')}</label>
          <input type="text" value={clubeFiltro} onChange={(e) => setClubeFiltro(e.target.value)} placeholder={t('acertos.buscar_placeholder')} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.projeto')}</label>
          <select value={projetoFiltro} onChange={(e) => setProjetoFiltro(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            <option value="">{t('stoploss.todos_projetos')}</option>
            {projetosDisponiveis.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.carregando')}</p>
      ) : linhasFiltradas.length === 0 ? (
        <p className="text-sm text-gray-500 italic">{t('pagamentos.nenhum_acerto')}</p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface2 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2 whitespace-nowrap">{t('pagamentos.col_club_id')}</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">{t('pagamentos.col_club_name')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Do ponto de vista da liga: positivo = a liga vai receber do clube; negativo = a liga precisa pagar ao clube.">{t('pagamentos.col_valor_acerto')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">{t('pagamentos.col_valor_pago')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Do ponto de vista da liga: positivo = a liga vai receber do clube; negativo = a liga precisa pagar ao clube.">{t('pagamentos.col_diferenca')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap" title={t('pagamentos.title_extra')}>{t('pagamentos.col_extra')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {linhasFiltradas.map((l) => (
                <tr key={l.acerto_id}>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{l.club_external_id}</td>
                  <td className="px-3 py-2 text-white whitespace-nowrap">{l.club_name}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(diferencaDaLiga(l.valor_acerto))}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.valor_pago)}</td>
                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${COR_CLASSE[corDiferenca(diferencaDaLiga(l.diferenca))]}`}>{fmt(diferencaDaLiga(l.diferenca))}</td>
                  <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{l.extra === 0 ? '—' : fmt(l.extra)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

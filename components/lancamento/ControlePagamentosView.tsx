'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, PiggyBank } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { ConfirmModal } from '@/components/ConfirmModal'
import { buscarPeriodosComAcerto, buscarPagamentosPorPeriodo, descontarDaCaucao, corDiferenca, type PeriodoPagamento, type AcertoPagamento } from '@/lib/pagamentos'

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

// Suporte vê os Envios segmentados (um pagamento por coluna) — é quem lança
// os pagamentos de verdade, precisa acompanhar cada remessa até quitar.
// Mesmos dados que CobrancaView (Financeiro), só a apresentação muda — ver
// lib/pagamentos.ts pra lógica compartilhada. Seletor é por semana (uma vez
// só cada period_end, não um import por Liga) — ver buscarPeriodosComAcerto.
export function ControlePagamentosView() {
  const { t } = useI18n()
  const [periodos, setPeriodos] = useState<PeriodoPagamento[]>([])
  const [periodoFim, setPeriodoFim] = useState('')
  const [clubeFiltro, setClubeFiltro] = useState('')
  const [projetoFiltro, setProjetoFiltro] = useState('')
  const [linhas, setLinhas] = useState<AcertoPagamento[]>([])
  const [loading, setLoading] = useState(false)
  const [descontando, setDescontando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmarDesconto, setConfirmarDesconto] = useState<AcertoPagamento | null>(null)

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

  async function handleDescontarCaucao() {
    const l = confirmarDesconto
    if (!l || !l.club_id) return
    const valor = Math.abs(l.diferenca)
    setDescontando(l.acerto_id); setError(null)
    try {
      await descontarDaCaucao(l.acerto_id, l.club_id, valor)
      setConfirmarDesconto(null)
      await load(periodoSelecionado)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setDescontando(null)
    }
  }

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

  // Sempre pelo menos 40 colunas de Envio abertas (mesmo pra clube sem
  // nenhum ainda) — um clube pode fazer várias dezenas de envios numa
  // semana só, e a coluna precisa já estar lá esperando, não aparecer só
  // depois que o envio existe (pedido do Cássio, igual a planilha antiga).
  // Se algum clube passar de 40 de verdade, mostra todos mesmo assim.
  const maxEnvios = Math.max(40, linhasFiltradas.reduce((max, l) => Math.max(max, l.envios.length), 0))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('pagamentos.titulo')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('pagamentos.subtitulo')}</p>
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

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

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
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Do ponto de vista do clube: positivo = o clube vai receber; negativo = o clube precisa pagar.">{t('pagamentos.col_diferenca')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Valor do Acerto — o que precisa ser quitado.">{t('pagamentos.col_valor_acerto')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Soma dos Envios pagos até agora.">{t('pagamentos.col_valor_pago')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap"></th>
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Caução lançada no período — só referência, não entra na Diferença (vive na própria conta dela).">Caução</th>
                {Array.from({ length: maxEnvios }).map((_, i) => (
                  <th key={i} className="text-right px-3 py-2 whitespace-nowrap">{t('pagamentos.col_envio', { n: String(i + 1) })}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {linhasFiltradas.map((l) => (
                <tr key={l.acerto_id}>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{l.club_external_id}</td>
                  <td className="px-3 py-2 text-white whitespace-nowrap">{l.club_name}</td>
                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${COR_CLASSE[corDiferenca(l.diferenca)]}`}>{fmt(l.diferenca)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.valor_acerto)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.valor_pago)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {l.diferenca < -0.005 && l.club_id && (
                      <button
                        type="button"
                        onClick={() => setConfirmarDesconto(l)}
                        disabled={descontando === l.acerto_id}
                        title="Descontar a Diferença da Caução do clube — quita o Acerto e reduz o Stoploss Atual na hora."
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gold/30 text-gold rounded-lg text-xs font-medium hover:bg-gold/10 disabled:opacity-50 transition-colors ml-auto"
                      >
                        {descontando === l.acerto_id && <Loader2 size={12} className="animate-spin" />}Descontar da Caução
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{l.caucao === 0 ? '—' : fmt(l.caucao)}</td>
                  {Array.from({ length: maxEnvios }).map((_, i) => (
                    <td key={i} className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{l.envios[i] ? fmt(l.envios[i].valor_assinado) : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!confirmarDesconto}
        title="Descontar da Caução"
        description={confirmarDesconto && `Descontar ${fmt(Math.abs(confirmarDesconto.diferenca))} da Caução de ${confirmarDesconto.club_name}? Isso quita a Diferença do Acerto e reduz o Stoploss Atual do clube na hora.`}
        tone="gold"
        icon={PiggyBank}
        saving={!!descontando}
        confirmLabel="Descontar"
        onConfirm={handleDescontarCaucao}
        onCancel={() => setConfirmarDesconto(null)}
      />
    </div>
  )
}

'use client'
import { useState, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2, Plus, Search, Check } from 'lucide-react'
import { getArvoreAgentesClube, setRakebackClubeAgente, addAgenteToClube, getAgentes, type ArvoreAgentesClube, type AgenteDoClube } from '@/lib/cadastro-api'
import type { Agente } from '@/lib/types'
import { useI18n } from '@/lib/i18n'

interface Props {
  open: boolean
  clubeId: string
  clubeNome: string
  onClose: () => void
}

// Pedido do Cássio ("cadê os SA e agentes aqui?", depois "em vez de
// redirecionar, eu abriria um pop up com a lista de SA + drill down de
// agentes de cada um"): popup leve dentro do "Editar Clube", sem sair da
// tela — mostra os Super Agentes vinculados a esse clube, clica pra ver os
// Agentes de cada um (mesma navegação SA → Agente já usada na Árvore de
// Acertos), com o % de rakeback editável ali mesmo (motivo original de ele
// ter perguntado: configurar o % sem precisar abrir mais uma tela).
export function AgentesDoClubePopup({ open, clubeId, clubeNome, onClose }: Props) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [arvore, setArvore] = useState<ArvoreAgentesClube | null>(null)
  const [saAberto, setSaAberto] = useState<string | null>(null)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  // Achado pelo Cássio no PIXGAME: digitou o % e não achou onde salvar —
  // só salvava no blur (clicar fora do campo), sem nenhum botão nem aviso
  // disso. Agora salva sozinho enquanto digita (debounced) e mostra um
  // check por 1,5s confirmando, pra não depender de perceber o blur.
  const [salvoId, setSalvoId] = useState<string | null>(null)
  const pctTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Busca pra vincular um Agente/SA já cadastrado a esse clube — achado
  // pelo Cássio no GETSTAR 5 (clube sem nenhum agente ainda): o popup só
  // deixava editar o % de quem já estava vinculado, não tinha como
  // vincular ninguém novo aqui ("não encontrei onde vincular o SA ou
  // Agente no clube"). Reaproveita addAgenteToClube (mesma função que a
  // tela de Agentes já usa) — só a busca/gatilho são novos.
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<Agente[]>([])
  const [vinculandoId, setVinculandoId] = useState<string | null>(null)
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setSaAberto(null)
    setBuscaAberta(false)
    setBusca('')
    setResultados([])
    setLoading(true)
    getArvoreAgentesClube(clubeId).then(setArvore).finally(() => setLoading(false))
    const timers = pctTimers.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [open, clubeId])

  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    if (!busca.trim()) { setResultados([]); return }
    buscaTimer.current = setTimeout(async () => {
      setBuscando(true)
      try { setResultados(await getAgentes(busca.trim())) }
      finally { setBuscando(false) }
    }, 400)
    return () => { if (buscaTimer.current) clearTimeout(buscaTimer.current) }
  }, [busca])

  if (!open) return null

  const idsJaVinculados = new Set([
    ...(arvore?.superAgentes.flatMap(sa => sa.agentes.map(a => a.id)) ?? []),
    ...(arvore?.agentesSoltos.map(a => a.id) ?? []),
  ])
  const resultadosFiltrados = resultados.filter(a => !idsJaVinculados.has(a.id))

  async function salvarPct(agenteId: string, pct: number | null) {
    const timer = pctTimers.current.get(agenteId)
    if (timer) { clearTimeout(timer); pctTimers.current.delete(agenteId) }
    setSalvandoId(agenteId)
    try {
      await setRakebackClubeAgente(clubeId, agenteId, pct)
      setSalvoId(agenteId)
      setTimeout(() => setSalvoId(atual => (atual === agenteId ? null : atual)), 1500)
    } finally {
      setSalvandoId(atual => (atual === agenteId ? null : atual))
    }
  }

  function editarPct(agenteId: string, pct: number | null) {
    atualizarLocal(agenteId, pct)
    const timer = pctTimers.current.get(agenteId)
    if (timer) clearTimeout(timer)
    pctTimers.current.set(agenteId, setTimeout(() => salvarPct(agenteId, pct), 600))
  }

  async function vincular(agente: Agente) {
    setVinculandoId(agente.id)
    try {
      await addAgenteToClube(clubeId, agente.id)
      setArvore(await getArvoreAgentesClube(clubeId))
      setBuscaAberta(false); setBusca(''); setResultados([])
    } finally {
      setVinculandoId(null)
    }
  }

  function atualizarLocal(agenteId: string, pct: number | null) {
    setArvore(prev => {
      if (!prev) return prev
      return {
        superAgentes: prev.superAgentes.map(sa => ({ ...sa, agentes: sa.agentes.map(a => a.id === agenteId ? { ...a, rakebackPct: pct } : a) })),
        agentesSoltos: prev.agentesSoltos.map(a => a.id === agenteId ? { ...a, rakebackPct: pct } : a),
      }
    })
  }

  function LinhaAgente({ agente }: { agente: AgenteDoClube }) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/[0.03]">
        <span className="text-sm text-white truncate">{agente.nome}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number" step="any" placeholder="0"
            value={agente.rakebackPct ?? ''}
            onChange={e => editarPct(agente.id, e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => salvarPct(agente.id, e.target.value === '' ? null : Number(e.target.value))}
            className="w-16 bg-surface border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right focus:outline-none focus:border-gold/50"
          />
          <span className="text-xs text-gray-500">%</span>
          {salvandoId === agente.id ? (
            <Loader2 size={12} className="animate-spin text-gold" />
          ) : salvoId === agente.id ? (
            <Check size={12} className="text-emerald-400" />
          ) : null}
        </div>
      </div>
    )
  }

  const saSelecionado = arvore?.superAgentes.find(sa => sa.id === saAberto) ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            {saSelecionado ? (
              <button type="button" onClick={() => setSaAberto(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gold mb-1 transition-colors">
                <ChevronLeft size={12} />{t('club_modal.agentes_popup_voltar')}
              </button>
            ) : null}
            <h2 className="text-base font-semibold text-white truncate">
              {saSelecionado ? saSelecionado.nome : clubeNome}
            </h2>
            {!saSelecionado && <p className="text-xs text-gray-500">{t('club_modal.agentes_popup_subtitulo')}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white shrink-0"><X size={18} /></button>
        </div>

        {!saSelecionado && (
          <div className="px-5 py-3 border-b border-white/10 shrink-0">
            {!buscaAberta ? (
              <button
                type="button"
                onClick={() => setBuscaAberta(true)}
                className="flex items-center gap-1.5 text-xs text-gold hover:text-gold/80 transition-colors"
              >
                <Plus size={13} />{t('club_modal.agentes_popup_vincular')}
              </button>
            ) : (
              <div>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text" autoFocus value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder={t('club_modal.agentes_popup_buscar_placeholder')}
                    className="w-full bg-surface border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-gold/50"
                  />
                </div>
                {busca.trim() && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                    {buscando ? (
                      <p className="text-xs text-gray-500 italic text-center py-3">{t('common.carregando')}</p>
                    ) : resultadosFiltrados.length === 0 ? (
                      <p className="text-xs text-gray-500 italic text-center py-3">{t('club_modal.agentes_popup_nenhum_resultado')}</p>
                    ) : (
                      resultadosFiltrados.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => vincular(a)}
                          disabled={vinculandoId === a.id}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-white/[0.03] text-left disabled:opacity-50"
                        >
                          <span className="text-xs text-white truncate">{a.nome}</span>
                          {vinculandoId === a.id && <Loader2 size={12} className="animate-spin text-gold shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-500 italic text-center py-8">{t('common.carregando')}</p>
          ) : saSelecionado ? (
            <div className="divide-y divide-white/5">
              {saSelecionado.agentes.map(a => <LinhaAgente key={a.id} agente={a} />)}
            </div>
          ) : arvore && (arvore.superAgentes.length > 0 || arvore.agentesSoltos.length > 0) ? (
            <div className="divide-y divide-white/5">
              {arvore.superAgentes.map(sa => (
                <button
                  key={sa.id}
                  type="button"
                  onClick={() => setSaAberto(sa.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/[0.03] text-left"
                >
                  <span className="text-sm text-white truncate">{sa.nome}</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                    {t('club_modal.agentes_popup_contagem', { n: sa.agentes.length })}
                    <ChevronRight size={13} />
                  </span>
                </button>
              ))}
              {arvore.agentesSoltos.map(a => <LinhaAgente key={a.id} agente={a} />)}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic text-center py-8">{t('club_modal.resumo_agentes_vazio')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

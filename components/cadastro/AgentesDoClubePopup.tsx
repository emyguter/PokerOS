'use client'
import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { getArvoreAgentesClube, setRakebackClubeAgente, type ArvoreAgentesClube, type AgenteDoClube } from '@/lib/cadastro-api'
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

  useEffect(() => {
    if (!open) return
    setSaAberto(null)
    setLoading(true)
    getArvoreAgentesClube(clubeId).then(setArvore).finally(() => setLoading(false))
  }, [open, clubeId])

  if (!open) return null

  async function salvarPct(agenteId: string, pct: number | null) {
    setSalvandoId(agenteId)
    try {
      await setRakebackClubeAgente(clubeId, agenteId, pct)
    } finally {
      setSalvandoId(null)
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
            onChange={e => atualizarLocal(agente.id, e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => salvarPct(agente.id, e.target.value === '' ? null : Number(e.target.value))}
            className="w-16 bg-surface border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right focus:outline-none focus:border-gold/50"
          />
          <span className="text-xs text-gray-500">%</span>
          {salvandoId === agente.id && <Loader2 size={12} className="animate-spin text-gold" />}
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

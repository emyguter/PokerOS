'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronRight, ChevronDown, RotateCcw } from 'lucide-react'
import { errMsg } from '@/lib/errors'
import { buscarPeriodosAcerto, type PeriodoAcerto } from '@/lib/relatorio-resumo-acertos'
import {
  buscarArvoreRaiz, buscarClubesPendentes, buscarArvoreClube, buscarJogadoresDoAgente,
  buscarClubesCotacaoDoImport,
  type ArvoreRaiz, type LigaNode, type ClubePendente, type ArvoreClube, type NoSuperAgente, type NoAgente, type NoJogador,
} from '@/lib/arvore-acertos'
import { supabase } from '@/lib/supabase'
import type { LinhaMeuAcerto } from '@/lib/meus-acertos'
import { processarAcertos, processarAcertosAgentes } from '@/lib/acertos-engine'
import { ClubAcertoCard } from './ClubAcertoCard'
import { ConfirmCotacaoModal } from './ConfirmCotacaoModal'

type PathEntry =
  | { tipo: 'liga'; ref: LigaNode }
  | { tipo: 'clube'; ref: LinhaMeuAcerto }
  | { tipo: 'superagente'; ref: NoSuperAgente }
  | { tipo: 'agente'; ref: NoAgente }
  | { tipo: 'jogador'; ref: NoJogador }

const KIND_LABEL: Record<PathEntry['tipo'], string> = {
  liga: 'Liga', clube: 'Clube', superagente: 'Super Agente', agente: 'Agente', jogador: 'Jogador',
}

function fmt(v: number): string {
  const neg = v < 0
  const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (neg ? '−R$ ' : 'R$ ') + s
}
function cor(v: number): string {
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-alert' : 'text-gray-400'
}
function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function nomeDoNode(p: PathEntry): string {
  return p.tipo === 'clube' ? p.ref.acerto.club_name : p.ref.nome
}

export function ArvoreAcertosView() {
  const [periodos, setPeriodos] = useState<PeriodoAcerto[]>([])
  const [periodoFiltro, setPeriodoFiltro] = useState('')
  const [raiz, setRaiz] = useState<ArvoreRaiz | null>(null)
  const [pendentes, setPendentes] = useState<ClubePendente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [path, setPath] = useState<PathEntry[]>([])
  const [busca, setBusca] = useState('')
  const [trayOpen, setTrayOpen] = useState(true)
  const [trayChecked, setTrayChecked] = useState<Set<string>>(new Set())

  const [clubeArvore, setClubeArvore] = useState<ArvoreClube | null>(null)
  const [jogadoresAgente, setJogadoresAgente] = useState<NoJogador[] | null>(null)

  const [cardAberto, setCardAberto] = useState<LinhaMeuAcerto | null>(null)
  const [recalcAlvo, setRecalcAlvo] = useState<{ nome: string; clube: LinhaMeuAcerto } | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [filaImports, setFilaImports] = useState<string[]>([])
  const [filaCotacao, setFilaCotacao] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async (periodo: string) => {
    setLoading(true); setError(null)
    try {
      const [r, p] = await Promise.all([buscarArvoreRaiz(periodo, null), buscarClubesPendentes(periodo, null)])
      setRaiz(r); setPendentes(p)
    } catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    buscarPeriodosAcerto().then((lista) => {
      setPeriodos(lista)
      if (lista.length > 0) {
        setPeriodoFiltro(lista[0].fim)
        load(lista[0].fim)
      } else {
        setLoading(false)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const atual = path[path.length - 1]

  // Carrega os filhos (Super Agente/Agente ou Jogador) de um novo caminho —
  // chamado direto pelos handlers de clique (push/popTo/troca de semana),
  // nunca de dentro de um efeito reagindo a `path` (evita setState em
  // cascata dentro de useEffect).
  function carregarFilhos(novoPath: PathEntry[], periodo: string) {
    setBusca('')
    const novoAtual = novoPath[novoPath.length - 1]
    if (novoAtual?.tipo === 'clube') {
      setClubeArvore(null)
      if (novoAtual.ref.acerto.club_id) buscarArvoreClube(novoAtual.ref.acerto.club_id, periodo).then(setClubeArvore)
    } else {
      setClubeArvore(null)
    }
    if (novoAtual?.tipo === 'agente') {
      const clubeNode = [...novoPath].reverse().find((p): p is PathEntry & { tipo: 'clube' } => p.tipo === 'clube')
      const clubeId = clubeNode?.ref.acerto.club_id
      if (clubeId) { buscarJogadoresDoAgente(novoAtual.ref.id, clubeId, periodo).then(setJogadoresAgente); return }
    }
    setJogadoresAgente(null)
  }

  function push(entry: PathEntry) {
    const novo = [...path, entry]
    setPath(novo)
    carregarFilhos(novo, periodoFiltro)
  }
  function popTo(i: number) {
    const novo = path.slice(0, i)
    setPath(novo)
    carregarFilhos(novo, periodoFiltro)
  }
  function mudarPeriodo(fim: string) {
    setPeriodoFiltro(fim)
    setPath([])
    setBusca('')
    load(fim)
  }

  // ── calcular/recalcular ──────────────────────────────────────────────

  async function rodarImports(importIds: string[]) {
    setCalculando(true)
    try {
      for (const importId of importIds) {
        const pendCotacao = await buscarClubesCotacaoDoImport(importId)
        if (pendCotacao.length > 0) {
          setFilaImports(importIds.slice(importIds.indexOf(importId)))
          setFilaCotacao(pendCotacao)
          setCalculando(false)
          return
        }
        const result = await processarAcertos(importId)
        if (!result.success) { alert('Erro ao calcular: ' + result.error); continue }
        const resultAgentes = await processarAcertosAgentes(importId)
        if (!resultAgentes.success) alert('Acertos por clube ok, mas erro no acerto de agentes: ' + resultAgentes.error)
      }
      await load(periodoFiltro)
      setTrayChecked(new Set())
      if (atual?.tipo === 'clube' && atual.ref.acerto.club_id) buscarArvoreClube(atual.ref.acerto.club_id, periodoFiltro).then(setClubeArvore)
    } finally {
      setCalculando(false)
    }
  }

  async function handleSalvarCotacao(valor: number) {
    const clube = filaCotacao[0]
    if (!clube) return
    setCalculando(true)
    await supabase.from('clubs').update({ cotacao: valor }).eq('id', clube.id)
    setCalculando(false)
    const resto = filaCotacao.slice(1)
    setFilaCotacao(resto)
    if (resto.length === 0) await rodarImports(filaImports)
  }

  function calcularSelecionados() {
    const importIds = [...new Set(pendentes.filter((p) => trayChecked.has(`${p.importId}|${p.externalId}`)).map((p) => p.importId))]
    if (importIds.length > 0) rodarImports(importIds)
  }

  function recalcularClube(l: LinhaMeuAcerto) {
    setRecalcAlvo({ nome: l.acerto.club_name, clube: l })
  }

  async function confirmarRecalculo() {
    if (!recalcAlvo) return
    const importId = recalcAlvo.clube.importId
    setRecalcAlvo(null)
    if (importId) await rodarImports([importId])
  }

  // ── filtro de busca no nível atual ───────────────────────────────────
  const q = normaliza(busca.trim())
  const filtraNome = (nome: string) => !q || normaliza(nome).includes(q)

  if (loading && !raiz) return <div className="py-16 text-center text-gray-500 text-sm">Carregando…</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Título "Árvore de Acertos" já removido daqui — duplicava o H1 da
            página (AcertosView), que é a única tela que renderiza esse
            componente. Mantém só a linha de trilha, que explica a navegação
            (não redundante com nada acima). */}
        <p className="text-sm text-gray-400">Liga → Clube → Super Agente → Agente → Jogador</p>
        {periodos.length > 0 && (
          <select
            value={periodoFiltro}
            onChange={(e) => mudarPeriodo(e.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50"
          >
            {periodos.map((p) => (
              <option key={p.fim} value={p.fim}>
                Semana: {new Date(p.inicio + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} → {new Date(p.fim + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      {pendentes.length > 0 && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 overflow-hidden">
          <button
            type="button"
            onClick={() => setTrayOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
            <strong className="text-sm text-white">{pendentes.length} clube{pendentes.length === 1 ? '' : 's'} ainda não calculado{pendentes.length === 1 ? '' : 's'}</strong>
            <span className="text-xs text-gray-500">essa semana</span>
            {trayOpen ? <ChevronDown size={14} className="ml-auto text-gray-500" /> : <ChevronRight size={14} className="ml-auto text-gray-500" />}
          </button>
          {trayOpen && (
            <>
              <div className="px-3 pb-1 flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                {pendentes.map((p) => {
                  const chave = `${p.importId}|${p.externalId}`
                  return (
                    <label key={chave} className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm hover:bg-white/[0.03] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trayChecked.has(chave)}
                        onChange={(e) => setTrayChecked((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(chave)
                          else next.delete(chave)
                          return next
                        })}
                        className="accent-gold w-3.5 h-3.5"
                      />
                      <span className="text-white flex-1">{p.nome}</span>
                      <span className="text-[10px] uppercase tracking-wide text-gray-600">{p.ligaNome}</span>
                    </label>
                  )
                })}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gold/15 mt-1">
                <span className="text-xs text-gray-500">{trayChecked.size} selecionado{trayChecked.size === 1 ? '' : 's'}</span>
                <button
                  type="button"
                  onClick={calcularSelecionados}
                  disabled={trayChecked.size === 0 || calculando}
                  className="px-4 py-1.5 bg-gold text-surface rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {calculando ? 'Calculando…' : 'Calcular selecionados'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* breadcrumb */}
      <div className="flex items-center flex-wrap gap-1 text-sm">
        <button type="button" onClick={() => popTo(0)} className={`font-semibold ${path.length === 0 ? 'text-gold' : 'text-gray-500 hover:text-gray-300'}`}>
          Todas as Ligas
        </button>
        {path.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={13} className="text-gray-700" />
            <span className="text-[9px] uppercase tracking-wide text-gray-600 bg-surface2 border border-white/10 rounded px-1.5 py-0.5 mr-0.5">{KIND_LABEL[p.tipo]}</span>
            <button
              type="button"
              onClick={() => popTo(i + 1)}
              className={`font-semibold ${i === path.length - 1 ? 'text-gold' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {nomeDoNode(p)}
            </button>
          </span>
        ))}
      </div>

      {/* faixa do nó atual */}
      <NoFaixa
        path={path}
        raiz={raiz}
        onVerCompleto={(l) => setCardAberto(l)}
        onRecalcular={recalcularClube}
        calculando={calculando}
      />

      {/* busca */}
      {(atual?.tipo !== 'jogador') && (
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome…"
            className="w-full bg-surface border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
          />
        </div>
      )}

      {/* filhos */}
      {!atual && raiz && (
        <>
          <Secao titulo="Ligas" contagem={raiz.ligas.length}>
            <Grade>
              {raiz.ligas.filter((l) => filtraNome(l.nome)).map((l) => (
                <CardLiga key={l.id} liga={l} onClick={() => push({ tipo: 'liga', ref: l })} />
              ))}
            </Grade>
          </Secao>
          {raiz.semLiga.length > 0 && (
            <Secao titulo="Clubes sem Liga" contagem={raiz.semLiga.length}>
              <Grade>
                {raiz.semLiga.filter((c) => filtraNome(c.acerto.club_name)).map((c) => (
                  <CardClube key={c.acerto.id} clube={c} onClick={() => push({ tipo: 'clube', ref: c })} />
                ))}
              </Grade>
            </Secao>
          )}
        </>
      )}

      {atual?.tipo === 'liga' && (
        <Secao titulo={`Clubes de ${atual.ref.nome}`} contagem={atual.ref.clubes.length}>
          <Grade>
            {atual.ref.clubes.filter((c) => filtraNome(c.acerto.club_name)).map((c) => (
              <CardClube key={c.acerto.id} clube={c} onClick={() => push({ tipo: 'clube', ref: c })} />
            ))}
          </Grade>
        </Secao>
      )}

      {atual?.tipo === 'clube' && (
        clubeArvore === null ? (
          <p className="text-sm text-gray-500 italic py-4">Carregando…</p>
        ) : (
          <>
            {clubeArvore.superAgentes.length > 0 && (
              <Secao titulo="Super Agentes" contagem={clubeArvore.superAgentes.length}>
                <Grade>
                  {clubeArvore.superAgentes.filter((s) => filtraNome(s.nome)).map((s) => (
                    <CardSuperAgente key={s.id} sa={s} onClick={() => push({ tipo: 'superagente', ref: s })} />
                  ))}
                </Grade>
              </Secao>
            )}
            {clubeArvore.agentesSoltos.length > 0 && (
              <Secao titulo="Agentes direto no clube" contagem={clubeArvore.agentesSoltos.length}>
                <Grade>
                  {clubeArvore.agentesSoltos.filter((a) => filtraNome(a.nome)).map((a) => (
                    <CardAgente key={a.id} agente={a} onClick={() => push({ tipo: 'agente', ref: a })} />
                  ))}
                </Grade>
              </Secao>
            )}
            {clubeArvore.superAgentes.length === 0 && clubeArvore.agentesSoltos.length === 0 && (
              <p className="text-sm text-gray-600 italic py-4">Sem agentes vinculados a esse clube nessa semana.</p>
            )}
          </>
        )
      )}

      {atual?.tipo === 'superagente' && (
        <Secao titulo={`Agentes de ${atual.ref.nome}`} contagem={atual.ref.agentes.length}>
          <Grade>
            {atual.ref.agentes.filter((a) => filtraNome(a.nome)).map((a) => (
              <CardAgente key={a.id} agente={a} onClick={() => push({ tipo: 'agente', ref: a })} />
            ))}
          </Grade>
        </Secao>
      )}

      {atual?.tipo === 'agente' && (
        jogadoresAgente === null ? (
          <p className="text-sm text-gray-500 italic py-4">Carregando…</p>
        ) : (
          <Secao titulo={`Jogadores de ${atual.ref.nome}`} contagem={jogadoresAgente.length}>
            <Grade>
              {jogadoresAgente.filter((j) => filtraNome(j.nome)).map((j) => (
                <CardJogador key={j.id} jogador={j} onClick={() => push({ tipo: 'jogador', ref: j })} />
              ))}
            </Grade>
          </Secao>
        )
      )}

      {atual?.tipo === 'jogador' && (
        <p className="text-sm text-gray-600 italic py-4">Jogador é a ponta da árvore — sem mais níveis abaixo.</p>
      )}

      {cardAberto && (
        <ClubAcertoCard
          acerto={cardAberto.acerto}
          ligaNome={cardAberto.ligaNome}
          periodStart={cardAberto.periodStart}
          periodEnd={cardAberto.periodEnd}
          onClose={() => setCardAberto(null)}
        />
      )}

      {recalcAlvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRecalcAlvo(null)} />
          <div className="relative bg-surface2 border border-white/10 rounded-2xl w-full max-w-sm mx-4 p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-gold/10 text-gold flex items-center justify-center mx-auto mb-3">
              <RotateCcw size={18} />
            </div>
            <h4 className="text-white font-semibold text-base mb-1.5">Recalcular semana inteira?</h4>
            <p className="text-xs text-gray-400 leading-relaxed mb-5">
              Vai reprocessar o arquivo completo dessa semana pra <strong className="text-white">{recalcAlvo.nome}</strong> — todos os clubes desse arquivo são recalculados junto, não só esse.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRecalcAlvo(null)} className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20">Cancelar</button>
              <button type="button" onClick={confirmarRecalculo} disabled={calculando} className="flex-1 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold disabled:opacity-50">Recalcular</button>
            </div>
          </div>
        </div>
      )}

      {filaCotacao.length > 0 && (
        <ConfirmCotacaoModal clube={filaCotacao[0]} saving={calculando} onSalvar={handleSalvarCotacao} />
      )}
    </div>
  )
}

// ─── faixa do nó selecionado ─────────────────────────────────────────────

function NoFaixa({ path, raiz, onVerCompleto, onRecalcular, calculando }: {
  path: PathEntry[]
  raiz: ArvoreRaiz | null
  onVerCompleto: (l: LinhaMeuAcerto) => void
  onRecalcular: (l: LinhaMeuAcerto) => void
  calculando: boolean
}) {
  const atual = path[path.length - 1]

  if (!atual) {
    if (!raiz) return null
    const total = [...raiz.ligas.flatMap((l) => l.clubes), ...raiz.semLiga].reduce((s, c) => s + c.valorFinal, 0)
    const rake = [...raiz.ligas.flatMap((l) => l.clubes), ...raiz.semLiga].reduce((s, c) => s + c.acerto.rake_total, 0)
    return (
      <Faixa titulo="Todas as Ligas" meta={`${raiz.ligas.length} ligas · ${raiz.semLiga.length} clube(s) sem liga`}>
        <Fig k="Rake total" v={fmt(rake)} />
        <Fig k="Total geral" v={fmt(total)} className={cor(total)} destaque />
      </Faixa>
    )
  }

  if (atual.tipo === 'liga') {
    const l = atual.ref
    const total = l.clubes.reduce((s, c) => s + c.valorFinal, 0)
    const rake = l.clubes.reduce((s, c) => s + c.acerto.rake_total, 0)
    return (
      <Faixa titulo={l.nome} meta={`${l.clubes.length} clube(s)`}>
        <Fig k="Rake total" v={fmt(rake)} />
        <Fig k="Total (liga)" v={fmt(total)} className={cor(total)} destaque />
      </Faixa>
    )
  }

  if (atual.tipo === 'clube') {
    const l = atual.ref
    return (
      <Faixa
        titulo={l.acerto.club_name}
        meta={`${l.acerto.club_external_id} · ${l.acerto.settlement_type}`}
        acoes={
          <>
            <button type="button" onClick={() => onVerCompleto(l)} className="px-3.5 py-1.5 bg-gold text-surface rounded-lg text-xs font-semibold">Ver acerto completo</button>
            <button type="button" onClick={() => onRecalcular(l)} disabled={calculando} className="px-3.5 py-1.5 border border-white/10 rounded-lg text-xs text-gray-300 hover:border-gold/40 disabled:opacity-40 flex items-center gap-1.5">
              <RotateCcw size={12} /> Recalcular semana
            </button>
          </>
        }
      >
        <Fig k="Rake total" v={fmt(l.acerto.rake_total)} />
        <Fig k="Ganhos" v={fmt(l.acerto.player_result)} className={cor(l.acerto.player_result)} />
        <Fig k="Fee" v={fmt(-l.acerto.fee_calculado)} className={cor(-l.acerto.fee_calculado)} />
        <Fig k="Bilhetes" v={fmt(l.acerto.bilhetes)} className={cor(l.acerto.bilhetes)} />
        <Fig k="Total" v={fmt(l.valorFinal)} className={cor(l.valorFinal)} destaque />
      </Faixa>
    )
  }

  if (atual.tipo === 'superagente') {
    const sa = atual.ref
    const rake = sa.agentes.reduce((s, a) => s + a.rakeTotal, 0)
    const total = sa.agentes.reduce((s, a) => s + a.valorRakeback, 0)
    return (
      <Faixa titulo={sa.nome} meta={`${sa.agentes.length} agente(s)`} tag="Rakeback, não Acerto completo">
        <Fig k="Rake total" v={fmt(rake)} />
        <Fig k="Rakeback devido" v={fmt(total)} className={cor(total)} destaque />
      </Faixa>
    )
  }

  if (atual.tipo === 'agente') {
    const a = atual.ref
    return (
      <Faixa titulo={a.nome} meta={`${a.rakebackPct}% de rakeback`} tag="Rakeback, não Acerto completo">
        <Fig k="Rake total" v={fmt(a.rakeTotal)} />
        <Fig k="Rakeback devido" v={fmt(a.valorRakeback)} className={cor(a.valorRakeback)} destaque />
      </Faixa>
    )
  }

  const j = atual.ref
  return (
    <Faixa titulo={j.nome} meta="Jogador" tag="Estatística, sem acerto próprio">
      <Fig k="Rake gerado" v={fmt(j.rake)} />
      <Fig k="Resultado" v={fmt(j.resultado)} className={cor(j.resultado)} destaque />
    </Faixa>
  )
}

function Faixa({ titulo, meta, tag, acoes, children }: { titulo: string; meta: string; tag?: string; acoes?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-white/10 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold text-white">{titulo}</h2>
            {tag && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-300 bg-sky-400/10 border border-sky-400/25 rounded px-1.5 py-0.5">{tag}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{meta}</p>
        </div>
        {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
      </div>
      <div className="grid gap-px bg-white/5 border border-white/5 rounded-xl overflow-hidden" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(110px, 1fr))` }}>
        {children}
      </div>
    </div>
  )
}
function Fig({ k, v, className, destaque }: { k: string; v: string; className?: string; destaque?: boolean }) {
  return (
    <div className={destaque ? 'bg-gold/[0.07] px-4 py-3' : 'bg-surface2 px-4 py-3'}>
      <div className={`text-[10px] uppercase tracking-wide mb-1 ${destaque ? 'text-gold/70' : 'text-gray-600'}`}>{k}</div>
      <div className={`text-base font-semibold ${className ?? 'text-white'}`}>{v}</div>
    </div>
  )
}

function Secao({ titulo, contagem, children }: { titulo: string; contagem: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{titulo}</h3>
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-xs text-gray-600">{contagem}</span>
      </div>
      {children}
    </div>
  )
}
function Grade({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>{children}</div>
}

function NodeCard({ icone, nome, sub, valor, semAcerto, onClick }: { icone: string; nome: string; sub: string; valor?: string; valorClasse?: string; semAcerto?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-surface border border-white/10 hover:border-gold/40 hover:bg-surface2 rounded-xl p-4 flex flex-col gap-2.5 transition-colors group"
    >
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-surface2 border border-white/10 flex items-center justify-center text-[11px] font-bold text-gray-400 group-hover:text-gold group-hover:border-gold/30 shrink-0">{icone}</span>
        <span className="text-sm font-semibold text-white truncate flex-1">{nome}</span>
        <ChevronRight size={14} className="text-gray-700 group-hover:text-gold shrink-0" />
      </div>
      <div className="text-[11px] text-gray-600 truncate">{sub}</div>
      {semAcerto ? (
        <span className="text-[10px] uppercase tracking-wide text-gold bg-gold/10 border border-gold/25 rounded px-1.5 py-0.5 self-start">falta calcular</span>
      ) : valor !== undefined ? (
        <div className={`text-sm font-semibold ${valor.startsWith('−') ? 'text-alert' : 'text-emerald-400'}`}>{valor}</div>
      ) : null}
    </button>
  )
}

function CardLiga({ liga, onClick }: { liga: LigaNode; onClick: () => void }) {
  const total = liga.clubes.reduce((s, c) => s + c.valorFinal, 0)
  return <NodeCard icone="L" nome={liga.nome} sub={`${liga.clubes.length} clube(s)`} valor={fmt(total)} onClick={onClick} />
}
function CardClube({ clube, onClick }: { clube: LinhaMeuAcerto; onClick: () => void }) {
  return <NodeCard icone="C" nome={clube.acerto.club_name} sub={clube.acerto.club_external_id} valor={fmt(clube.valorFinal)} onClick={onClick} />
}
function CardSuperAgente({ sa, onClick }: { sa: NoSuperAgente; onClick: () => void }) {
  const total = sa.agentes.reduce((s, a) => s + a.valorRakeback, 0)
  return <NodeCard icone="SA" nome={sa.nome} sub={`${sa.agentes.length} agente(s)`} valor={fmt(total)} onClick={onClick} />
}
function CardAgente({ agente, onClick }: { agente: NoAgente; onClick: () => void }) {
  return <NodeCard icone="A" nome={agente.nome} sub={`${agente.rakebackPct}% rakeback`} valor={fmt(agente.valorRakeback)} onClick={onClick} />
}
function CardJogador({ jogador, onClick }: { jogador: NoJogador; onClick: () => void }) {
  return <NodeCard icone="J" nome={jogador.nome} sub={`rake gerado ${fmt(jogador.rake)}`} valor={fmt(jogador.resultado)} onClick={onClick} />
}

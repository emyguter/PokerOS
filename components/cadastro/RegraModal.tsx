'use client'
import { useState, useEffect } from 'react'
import { X, Loader2, Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import type { Regra, RegraForm, RegraCondicaoForm, RegraTipo, FaixaMultaForm, LayoutCampoForm, CampoClube } from '@/lib/types'
import { formatIndicadorNome } from '@/lib/indicadores'
import { supabase } from '@/lib/supabase'
import { LAYOUT_PADRAO, LABEL_CAMPO, ehObrigatorio } from '@/lib/relatorio-acerto'

interface Indicador { id: string; nome: string; descricao: string | null }

interface Props {
  open: boolean
  editing: Regra | null
  // Só vale criando (editing null) — de qual aba o "Nova Regra" foi aberto.
  // 'multa_atraso' cria só a Multa sozinha, sem forçar o par Cálculo+Layout
  // junto (a aba de Multa não tem porque ver Cálculo/Layout no meio). As
  // outras abas (ou sem passar nada) mantêm o padrão de sempre criar o par.
  tipoNovo?: RegraTipo
  onClose: () => void
  // Uma etapa marcada = uma Regra criada — pode ser 1, 2 ou 3 de uma vez
  // (Cálculo/Layout/Multa coexistem, nenhuma sobrepõe a outra). Editando,
  // vem sempre com exatamente 1 item (a etapa fixa daquela regra) — Cálculo
  // e Layout são editados em telas/submenus separados (não dá pra adivinhar
  // com segurança qual Layout pareia quando a Regra de Cálculo é reusada em
  // clubes com Layouts diferentes entre si).
  onSave: (forms: RegraForm[]) => void
  saving: boolean
  error?: string | null
}

const EMPTY_COND: RegraCondicaoForm = { indicador_ids: [''], operador: '>', valor: null, resultado_pct: null, is_fallback: false }
const EMPTY_FAIXA: FaixaMultaForm = { quantidade: null, unidade: 'semanas', percentual: null }
const LAYOUT_INICIAL: LayoutCampoForm[] = LAYOUT_PADRAO.map((campo, ordem) => ({ campo, ordem, visivel: true }))
const LABEL_TIPO: Record<RegraTipo, string> = { faixa: 'Cálculo de Acerto', multa_atraso: 'Multa de Acerto', layout_acerto: 'Layout do Acerto' }
// Nome diferente de LABEL_CAMPO (importado acima) pra não colidir — aquele é
// dos campos do Layout do Acerto, esse é sobre qual taxa do clube a regra incide.
const LABEL_CAMPO_CLUBE: Record<CampoClube, string> = { fee_mtt: 'Rake MTT', fee_cash: 'Rake Cash', taxa_op: 'Taxa Operacional', spinup: 'SpinUp', rake_total: 'Rake', taxa_liga: 'Taxa da Liga' }
const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'

// Cálculo de Acerto e Layout do Acerto sempre nascem juntos — não fazem
// sentido isolados (é o que define a % E o que mostra no card de Acerto),
// por isso não têm checkbox pra desligar, sempre viram sua Regra. Multa de
// Acerto é a única etapa de verdade opcional.
function Secao({ titulo, descricao, children }: { titulo: string; descricao: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{titulo}</p>
        <p className="text-xs text-gray-600 mt-0.5">{descricao}</p>
      </div>
      {children}
    </div>
  )
}

function EtapaOpcional({ titulo, descricao, checked, onToggle, children }: { titulo: string; descricao: string; checked: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <div className={`rounded-lg border transition-colors ${checked ? 'border-gold/40 bg-gold/[0.03]' : 'border-white/10'}`}>
      <label className="flex items-start gap-3 px-3 py-3 cursor-pointer select-none">
        <input type="checkbox" checked={checked} onChange={onToggle} className="accent-gold mt-0.5" />
        <div>
          <p className="text-sm font-medium text-white">{titulo}</p>
          <p className="text-xs text-gray-500 mt-0.5">{descricao}</p>
        </div>
      </label>
      {checked && children && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  )
}

export function RegraModal({ open, editing, tipoNovo, onClose, onSave, saving, error }: Props) {
  const [nome, setNome] = useState('')
  const [campo, setCampo] = useState<CampoClube | null>(null)
  const [condicoes, setCondicoes] = useState<RegraCondicaoForm[]>([])
  const [faixasMulta, setFaixasMulta] = useState<FaixaMultaForm[]>([{ ...EMPTY_FAIXA }])
  const [layoutCampos, setLayoutCampos] = useState<LayoutCampoForm[]>(LAYOUT_INICIAL)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [indicadores, setIndicadores] = useState<Indicador[]>([])
  // Só vale criando regra nova — Multa é a única etapa opcional (Cálculo e
  // Layout sempre nascem juntos). Editando, a etapa já é fixa (é o
  // editing.tipo) — não existe mais conversão de tipo numa regra existente.
  const [incluirMulta, setIncluirMulta] = useState(false)

  useEffect(() => {
    if (open) supabase.from('indicadores').select('*').order('nome').then(({ data }) => { if (data) setIndicadores(data) })
  }, [open])

  useEffect(() => {
    setNome(editing?.nome ?? '')
    setCampo(editing?.campo ?? null)
    setCondicoes(editing?.condicoes ?? [])
    setFaixasMulta(editing?.faixasMulta && editing.faixasMulta.length > 0 ? editing.faixasMulta : [{ ...EMPTY_FAIXA }])
    setLayoutCampos(editing?.layoutCampos && editing.layoutCampos.length > 0 ? [...editing.layoutCampos].sort((a, b) => a.ordem - b.ordem) : LAYOUT_INICIAL)
    setIncluirMulta(false)
  }, [editing, open])

  if (!open) return null

  const addCondicao = () => setCondicoes(c => [...c, { ...EMPTY_COND }])
  const addFallback = () => { if (condicoes.some(c => c.is_fallback)) return; setCondicoes(c => [...c, { ...EMPTY_COND, is_fallback: true, operador: '>=' }]) }
  const removeCondicao = (i: number) => setCondicoes(c => c.filter((_, j) => j !== i))
  const setCondicao = (i: number, k: keyof RegraCondicaoForm, v: any) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, [k]: v } : item))
  const setTermo = (i: number, ti: number, v: string) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: item.indicador_ids.map((id, tj) => tj === ti ? v : id) } : item))
  const addTermo = (i: number) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: [...item.indicador_ids, ''] } : item))
  const removeTermo = (i: number, ti: number) => setCondicoes(c => c.map((item, j) => j === i ? { ...item, indicador_ids: item.indicador_ids.filter((_, tj) => tj !== ti) } : item))

  const addFaixa = () => setFaixasMulta(f => [...f, { ...EMPTY_FAIXA }])
  const removeFaixa = (i: number) => setFaixasMulta(f => f.filter((_, j) => j !== i))
  const setFaixa = (i: number, k: keyof FaixaMultaForm, v: any) => setFaixasMulta(f => f.map((item, j) => j === i ? { ...item, [k]: v } : item))

  const toggleVisivel = (i: number) => setLayoutCampos(l => l.map((item, j) => j === i && !ehObrigatorio(item.campo) ? { ...item, visivel: !item.visivel } : item))
  // Move pelo nome do campo, não pelo índice onde o arrasto começou — o
  // índice fica velho assim que a lista reordena uma vez no meio do
  // arrasto, e ficava movendo a linha errada a cada novo dragover (lia como
  // "não tá performando bem", mas o bug de verdade era esse, não velocidade).
  // Sem mudança nenhuma na posição, devolve a mesma referência de array de
  // propósito — React pula o re-render nos dragover repetidos parado em
  // cima do mesmo lugar, em vez de recalcular a lista toda a cada pixel.
  function moverCampo(campoArrastado: string, paraIndex: number) {
    setLayoutCampos(l => {
      const deIndex = l.findIndex(c => c.campo === campoArrastado)
      if (deIndex === -1 || deIndex === paraIndex) return l
      const next = [...l]
      const [item] = next.splice(deIndex, 1)
      next.splice(paraIndex, 0, item)
      return next.map((c, idx) => ({ ...c, ordem: idx }))
    })
  }

  // Setinhas ao lado do arrasto — funcionam em qualquer dispositivo (o
  // arrasto nativo do navegador não funciona em touch/celular).
  function moverPorSeta(i: number, direcao: -1 | 1) {
    setLayoutCampos(l => {
      const alvo = i + direcao
      if (alvo < 0 || alvo >= l.length) return l
      const next = [...l]
      ;[next[i], next[alvo]] = [next[alvo], next[i]]
      return next.map((c, idx) => ({ ...c, ordem: idx }))
    })
  }

  // Criando regra nova, Cálculo e Layout sempre existem juntos (é o que
  // define a % e o que mostra no card de Acerto — não faz sentido um sem o
  // outro) — exceto quando o "Nova Regra" foi aberto de dentro da aba Multa
  // (tipoNovo), aí cria só a Multa sozinha, sem Cálculo/Layout no meio.
  // Editando, só existe UMA etapa: a que a regra já é (tipo fixo pra
  // sempre) — cada tipo é editado no seu próprio submenu (ver
  // app/admin/regras/page.tsx), não dá pra combinar Cálculo+Layout numa
  // edição só sem arriscar editar o Layout errado quando o Cálculo é
  // reusado em clubes com Layouts diferentes.
  const criandoSoMulta = !editing && tipoNovo === 'multa_atraso'
  const mostrarCalculo = editing ? editing.tipo === 'faixa' : !criandoSoMulta
  const mostrarLayout = editing ? editing.tipo === 'layout_acerto' : !criandoSoMulta
  const mostrarMulta = editing ? editing.tipo === 'multa_atraso' : (criandoSoMulta || incluirMulta)
  const precisaNome = mostrarCalculo || mostrarMulta

  const multaConteudo = (
    <>
      <p className="text-xs text-gray-600">A maior faixa já atingida vale sozinha (não soma com as anteriores) — incide sobre o valor da parcela atrasada.</p>
      {faixasMulta.map((f, i) => (
        <div key={i} className="flex items-center gap-2 p-3 rounded-lg border border-white/10 bg-surface2">
          <input
            type="number" step="1" min="1" value={f.quantidade ?? ''}
            onChange={e => setFaixa(i, 'quantidade', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="Ex: 1" className={`${inputCls} w-20`}
          />
          <select value={f.unidade} onChange={e => setFaixa(i, 'unidade', e.target.value)} className={`${inputCls} w-auto`}>
            <option value="dias">dia(s)</option>
            <option value="semanas">semana(s)</option>
          </select>
          <span className="text-gray-500 text-sm">de atraso →</span>
          <input
            type="number" step="any" value={f.percentual ?? ''}
            onChange={e => setFaixa(i, 'percentual', e.target.value === '' ? null : Number(e.target.value))}
            placeholder="Ex: 2" className={`${inputCls} w-24`}
          />
          <span className="text-gray-500 text-sm">%</span>
          {faixasMulta.length > 1 && (
            <button type="button" onClick={() => removeFaixa(i)} className="ml-auto text-gray-500 hover:text-alert transition-colors"><Trash2 size={14} /></button>
          )}
        </div>
      ))}
      <button type="button" onClick={addFaixa} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:border-gold/50 hover:text-white transition-all">
        <Plus size={12} />Faixa
      </button>
    </>
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const forms: RegraForm[] = []
    if (mostrarCalculo) forms.push({ nome, tipo: 'faixa', campo, condicoes, faixasMulta: [], layoutCampos: [] })
    // Layout do Acerto não pede Nome — não faz muito sentido nomear "qual
    // ordem os campos aparecem", então usa um nome fixo na lista de Regras.
    if (mostrarLayout) forms.push({ nome: 'Layout do Acerto', tipo: 'layout_acerto', campo: null, condicoes: [], faixasMulta: [], layoutCampos })
    if (mostrarMulta) forms.push({ nome, tipo: 'multa_atraso', campo: null, condicoes: [], faixasMulta, layoutCampos: [] })
    onSave(forms)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">
            {editing ? `Editar Regra — ${LABEL_TIPO[editing.tipo]}` : criandoSoMulta ? 'Nova Multa de Acerto' : 'Nova Regra'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {!editing && !criandoSoMulta && (
              <p className="text-xs text-gray-500">
                Cálculo de Acerto e Layout do Acerto sempre nascem juntos aqui — Multa de Acerto é opcional, marque só se essa regra tiver. Cada etapa vira sua própria Regra na lista, e vai precisar do próprio vínculo depois.
              </p>
            )}

            {precisaNome && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome<span className="text-gray-500 ml-1">*</span></label>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)} required placeholder="Ex: 5%-15%" className={inputCls} />
                {!editing && incluirMulta && (
                  <p className="text-xs text-gray-600 mt-1">Usado nas duas regras (Cálculo e Multa) — dá pra renomear cada uma depois, separadamente.</p>
                )}
              </div>
            )}

            {mostrarCalculo && (
            <Secao titulo="Cálculo de Acerto" descricao="Faixa SE/ENTÃO — % que varia por rake/ganhos">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Aplica em<span className="text-gray-500 ml-1">*</span></label>
                  <p className="text-xs text-gray-600 mb-1.5">Sobre qual taxa do clube esse percentual incide (Taxa da Liga é a única daqui que se vincula a uma Liga, não a um Clube).</p>
                  <select value={campo ?? ''} onChange={e => setCampo(e.target.value ? e.target.value as CampoClube : null)} required className={inputCls}>
                    <option value="">Selecione</option>
                    {(Object.keys(LABEL_CAMPO_CLUBE) as CampoClube[]).map(c => <option key={c} value={c}>{LABEL_CAMPO_CLUBE[c]}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Condições SE / ENTÃO</p>
                  {condicoes.map((c, i) => (
                    <div key={i} className={`p-3 rounded-lg border space-y-2 ${c.is_fallback ? 'border-gold/30 bg-gold/5' : 'border-white/10 bg-surface2'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-400">{c.is_fallback ? 'SENÃO' : `SE ${i + 1}`}</span>
                        <button type="button" onClick={() => removeCondicao(i)} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={13} /></button>
                      </div>
                      {!c.is_fallback && (
                        <>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {c.indicador_ids.map((id, ti) => (
                              <div key={ti} className="flex items-center gap-1">
                                {ti > 0 && <span className="text-gray-500 text-xs">+</span>}
                                <select value={id} onChange={e => setTermo(i, ti, e.target.value)} className={`${inputCls} w-auto`}>
                                  <option value="">Indicador</option>
                                  {indicadores.map(ind => <option key={ind.id} value={ind.id}>{formatIndicadorNome(ind.nome, ind.descricao)}</option>)}
                                </select>
                                {c.indicador_ids.length > 1 && (
                                  <button type="button" onClick={() => removeTermo(i, ti)} className="text-gray-500 hover:text-alert transition-colors"><Trash2 size={12} /></button>
                                )}
                              </div>
                            ))}
                            <button type="button" onClick={() => addTermo(i)} className="text-gold text-xs hover:underline">+ variável</button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select value={c.operador} onChange={e => setCondicao(i, 'operador', e.target.value)} className={inputCls}>
                              {['>', '>=', '<', '<='].map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                            <input type="number" step="any" value={c.valor ?? ''} onChange={e => setCondicao(i, 'valor', e.target.value === '' ? null : Number(e.target.value))} placeholder="Valor" className={inputCls} />
                          </div>
                        </>
                      )}
                      <input type="number" step="any" value={c.resultado_pct ?? ''} onChange={e => setCondicao(i, 'resultado_pct', e.target.value === '' ? null : Number(e.target.value))} placeholder="Resultado (%)" className={inputCls} />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={addCondicao} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:border-gold/50 hover:text-white transition-all">
                      <Plus size={12} />SE condição
                    </button>
                    {!condicoes.some(c => c.is_fallback) && (
                      <button type="button" onClick={addFallback} className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-white/10 rounded-lg hover:border-gold/50 hover:text-white transition-all">
                        <Plus size={12} />SENÃO (regra padrão)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Secao>
            )}

            {mostrarLayout && (
            <Secao titulo="Layout do Acerto" descricao="Quais campos aparecem e em que ordem, no card de Acerto">
              <p className="text-xs text-gray-600">Arraste pra reordenar (ou use as setinhas — funcionam melhor no celular). Os marcados como obrigatório sempre aparecem — só dá pra ligar/desligar os outros.</p>
              <div className="space-y-1">
                {layoutCampos.map((c, i) => {
                  const obrigatorio = ehObrigatorio(c.campo)
                  return (
                    <div
                      key={c.campo}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.campo); setArrastando(c.campo) }}
                      onDragOver={(e) => { e.preventDefault(); if (arrastando !== null && arrastando !== c.campo) moverCampo(arrastando, i) }}
                      onDrop={(e) => e.preventDefault()}
                      onDragEnd={() => setArrastando(null)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${arrastando === c.campo ? 'border-gold/50 bg-gold/10 opacity-60' : 'border-white/10 bg-surface2'}`}
                    >
                      <GripVertical size={14} className="text-gray-600 shrink-0" />
                      <div className="flex flex-col shrink-0 -my-1">
                        <button type="button" onClick={() => moverPorSeta(i, -1)} disabled={i === 0} className="text-gray-500 hover:text-white disabled:opacity-20 disabled:hover:text-gray-500 transition-colors"><ChevronUp size={13} /></button>
                        <button type="button" onClick={() => moverPorSeta(i, 1)} disabled={i === layoutCampos.length - 1} className="text-gray-500 hover:text-white disabled:opacity-20 disabled:hover:text-gray-500 transition-colors"><ChevronDown size={13} /></button>
                      </div>
                      <span className="text-sm text-white flex-1">{LABEL_CAMPO[c.campo as keyof typeof LABEL_CAMPO] ?? c.campo}</span>
                      {obrigatorio ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-surface border border-white/10 text-gray-500 text-[10px] whitespace-nowrap">obrigatório</span>
                      ) : (
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                          <input type="checkbox" checked={c.visivel} onChange={() => toggleVisivel(i)} className="accent-gold" />
                          visível
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            </Secao>
            )}

            {!editing && !criandoSoMulta ? (
              <EtapaOpcional
                titulo="Multa de Acerto"
                descricao="% de multa por atraso, pra Dívidas e Acordos — opcional, nem toda regra precisa"
                checked={incluirMulta}
                onToggle={() => setIncluirMulta(v => !v)}
              >
                {multaConteudo}
              </EtapaOpcional>
            ) : mostrarMulta && (
              <Secao titulo="Multa de Acerto" descricao="% de multa por atraso, pra Dívidas e Acordos">
                {multaConteudo}
              </Secao>
            )}

            {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar Regra{!editing && incluirMulta ? 's' : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

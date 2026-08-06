'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { AlertTriangle, Link2, Loader2, Pencil, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { TIPOS } from './ExtratoView'

interface Entrada {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  origem: 'suporte' | 'genia'
  status: string | null
  clube_id: string
  clubs: { name: string } | null
}

type Motivo = 'sem_par' | 'divergencia'

interface ItemPendencia {
  motivo: Motivo
  principal: Entrada
  par?: Entrada
}

interface Edicao { id: string; valor: string }

const JANELA_DIAS = 7
const LABEL_ORIGEM: Record<string, string> = { suporte: 'Suporte', genia: 'Genia' }

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatData(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}
function diffDias(a: string, b: string) {
  return Math.abs((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)
}
function valorBate(a: number, b: number) {
  return Math.abs(a - b) < 0.005
}
function chaveBase(e: Entrada) {
  return `${e.clube_id}|${e.tipo}|${e.natureza}`
}
function hojeMenos(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

function Valor({ e, editando, onEditar, onMudar, onSalvar, onCancelar }: {
  e: Entrada
  editando: Edicao | null
  onEditar: (ed: Edicao) => void
  onMudar: (ed: Edicao) => void
  onSalvar: () => void
  onCancelar: () => void
}) {
  if (editando?.id === e.id) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text" inputMode="decimal" autoFocus value={editando.valor}
          onChange={ev => onMudar({ id: e.id, valor: ev.target.value })}
          className="w-24 bg-surface border border-gold/50 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
        />
        <button onClick={onSalvar} className="p-1 text-success hover:bg-success/10 rounded"><Check size={14} /></button>
        <button onClick={onCancelar} className="p-1 text-gray-500 hover:bg-white/10 rounded"><X size={14} /></button>
      </div>
    )
  }
  return (
    <button
      onClick={() => onEditar({ id: e.id, valor: String(e.valor) })}
      className={`flex items-center gap-1 text-sm font-medium hover:underline ${e.natureza === 'credito' ? 'text-success' : 'text-alert'}`}
    >
      {e.natureza === 'credito' ? '+' : '−'}{formatMoeda(e.valor)}
      <Pencil size={11} className="text-gray-500" />
    </button>
  )
}

function ColunaPendencia({ titulo, desc, itens, ladoOposto, t, editando, vinculando, onEditarValor, onMudarValor, onSalvarValor, onCancelarValor, onMudarVinculo, onVincular }: {
  titulo: string
  desc: string
  itens: ItemPendencia[]
  ladoOposto: Entrada[]
  t: (path: string, vars?: Record<string, string | number>) => string
  editando: Edicao | null
  vinculando: Record<string, string>
  onEditarValor: (ed: Edicao) => void
  onMudarValor: (ed: Edicao) => void
  onSalvarValor: () => void
  onCancelarValor: () => void
  onMudarVinculo: (id: string, outroId: string) => void
  onVincular: (item: ItemPendencia, outroId: string) => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-white">{titulo} <span className="text-gray-500 font-normal">({itens.length})</span></p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {itens.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">{t('conciliacao.sem_pendencias')}</div>
        ) : (
          <div className="divide-y divide-white/5">
            {itens.map((item, i) => {
              const e = item.principal
              return (
                <div key={`${e.id}-${i}`} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-white">
                        {e.clubs?.name ?? '—'} <span className="text-gray-500">· {t(TIPOS.find(tp => tp.value === e.tipo)?.labelKey ?? e.tipo)}</span>
                      </p>
                      <p className="text-xs text-gray-500">{formatData(e.data_lancamento)}{e.descricao ? ` · ${e.descricao}` : ''}</p>
                    </div>
                    <Valor e={e} editando={editando} onEditar={onEditarValor} onMudar={onMudarValor} onSalvar={onSalvarValor} onCancelar={onCancelarValor} />
                  </div>

                  {item.motivo === 'divergencia' && item.par && (
                    <div className="flex items-center gap-2 text-xs bg-alert/5 border border-alert/20 rounded-lg px-3 py-2">
                      <AlertTriangle size={13} className="text-alert shrink-0" />
                      <span className="text-gray-400">
                        {LABEL_ORIGEM[item.par.origem]} lançou{' '}
                        <Valor e={item.par} editando={editando} onEditar={onEditarValor} onMudar={onMudarValor} onSalvar={onSalvarValor} onCancelar={onCancelarValor} />
                        {' '}em {formatData(item.par.data_lancamento)} — valores não batem.
                      </span>
                    </div>
                  )}

                  {item.motivo === 'sem_par' && (
                    <div className="flex items-center gap-2">
                      <select
                        value={vinculando[e.id] ?? ''}
                        onChange={ev => onMudarVinculo(e.id, ev.target.value)}
                        className="flex-1 bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-gold/50"
                      >
                        <option value="">{t('conciliacao.selecione_par')}</option>
                        {ladoOposto.map(o => (
                          <option key={o.id} value={o.id}>
                            {o.clubs?.name} · {formatData(o.data_lancamento)} · {o.natureza === 'credito' ? '+' : '−'}{formatMoeda(o.valor)}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!vinculando[e.id]}
                        onClick={() => onVincular(item, vinculando[e.id])}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-surface2 border border-white/10 rounded-lg text-xs text-gold hover:border-gold/50 disabled:opacity-30 transition-colors"
                      >
                        <Link2 size={12} />{t('conciliacao.vincular')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function ConciliacaoView() {
  const { t } = useI18n()
  const [dataInicio, setDataInicio] = useState(hojeMenos(60))
  const [dataFim, setDataFim] = useState('')
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<Edicao | null>(null)
  const [vinculando, setVinculando] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let query = supabase
        .from('lancamentos')
        .select('id, tipo, natureza, valor, descricao, data_lancamento, origem, status, clube_id, conciliado_com, clubs(name)')
        .neq('tipo', 'caucao')
        .gte('data_lancamento', dataInicio)
        .order('data_lancamento', { ascending: true })
      if (dataFim) query = query.lte('data_lancamento', dataFim)
      const { data, error: err } = await query
      if (err) throw err
      setEntradas(((data ?? []) as unknown as (Entrada & { conciliado_com: string | null })[]).filter(e => !e.conciliado_com))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => { load() }, [load])

  const { pendGenia, pendSuporte, conciliadosAgora } = useMemo(() => {
    const suporte = entradas.filter(e => e.origem === 'suporte')
    const genia = entradas.filter(e => e.origem === 'genia')

    const geniaPorChave = new Map<string, Entrada[]>()
    for (const g of genia) {
      const k = chaveBase(g)
      geniaPorChave.set(k, [...(geniaPorChave.get(k) ?? []), g])
    }
    const geniaUsados = new Set<string>()

    const pendGenia: ItemPendencia[] = []
    const pendSuporte: ItemPendencia[] = []
    const conciliadosAgora: { suporte: Entrada; genia: Entrada }[] = []

    for (const s of suporte) {
      const candidatos = (geniaPorChave.get(chaveBase(s)) ?? []).filter(g => !geniaUsados.has(g.id))
      const melhor = candidatos
        .filter(g => diffDias(g.data_lancamento, s.data_lancamento) <= JANELA_DIAS)
        .sort((a, b) => {
          const diffValorA = Math.abs(a.valor - s.valor), diffValorB = Math.abs(b.valor - s.valor)
          if (diffValorA !== diffValorB) return diffValorA - diffValorB
          return diffDias(a.data_lancamento, s.data_lancamento) - diffDias(b.data_lancamento, s.data_lancamento)
        })[0]

      if (!melhor) { pendGenia.push({ motivo: 'sem_par', principal: s }); continue }
      geniaUsados.add(melhor.id)
      if (valorBate(melhor.valor, s.valor)) {
        conciliadosAgora.push({ suporte: s, genia: melhor })
      } else {
        pendGenia.push({ motivo: 'divergencia', principal: s, par: melhor })
        pendSuporte.push({ motivo: 'divergencia', principal: melhor, par: s })
      }
    }
    for (const g of genia) {
      if (!geniaUsados.has(g.id)) pendSuporte.push({ motivo: 'sem_par', principal: g })
    }

    return { pendGenia, pendSuporte, conciliadosAgora }
  }, [entradas])

  // Persiste os pares que bateram certinho, pra não reprocessar toda vez —
  // e some da lista na próxima carga (filtro `!conciliado_com` no load).
  useEffect(() => {
    if (conciliadosAgora.length === 0) return
    setProcessando(true)
    Promise.all(conciliadosAgora.flatMap(({ suporte, genia }) => [
      supabase.from('lancamentos').update({ conciliado_com: genia.id, conciliado_em: new Date().toISOString() }).eq('id', suporte.id),
      supabase.from('lancamentos').update({ conciliado_com: suporte.id, conciliado_em: new Date().toISOString() }).eq('id', genia.id),
    ])).then(() => { setProcessando(false); load() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conciliadosAgora])

  async function salvarEdicao() {
    if (!editando) return
    const valorNum = Number(editando.valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) return
    await supabase.from('lancamentos').update({ valor: valorNum }).eq('id', editando.id)
    setEditando(null)
    await load()
  }

  async function vincular(item: ItemPendencia, outroId: string) {
    const outro = entradas.find(e => e.id === outroId)
    if (!outro) return
    const agora = new Date().toISOString()
    await Promise.all([
      supabase.from('lancamentos').update({ conciliado_com: outro.id, conciliado_em: agora }).eq('id', item.principal.id),
      supabase.from('lancamentos').update({ conciliado_com: item.principal.id, conciliado_em: agora }).eq('id', outro.id),
    ])
    setVinculando(v => { const n = { ...v }; delete n[item.principal.id]; return n })
    await load()
  }

  const geniaEntradas = useMemo(() => entradas.filter(e => e.origem === 'genia'), [entradas])
  const suporteEntradas = useMemo(() => entradas.filter(e => e.origem === 'suporte'), [entradas])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.de')}</label>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('extrato.ate')}</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      {loading || processando ? (
        <div className="p-8 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" />{processando ? t('conciliacao.recalculando') : t('common.carregando')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <ColunaPendencia
            titulo={t('conciliacao.pendencias_genia')}
            desc={t('conciliacao.pendencias_genia_desc')}
            itens={pendGenia}
            ladoOposto={geniaEntradas}
            t={t}
            editando={editando}
            vinculando={vinculando}
            onEditarValor={setEditando}
            onMudarValor={setEditando}
            onSalvarValor={salvarEdicao}
            onCancelarValor={() => setEditando(null)}
            onMudarVinculo={(id, outroId) => setVinculando(v => ({ ...v, [id]: outroId }))}
            onVincular={vincular}
          />
          <ColunaPendencia
            titulo={t('conciliacao.pendencias_suporte')}
            desc={t('conciliacao.pendencias_suporte_desc')}
            itens={pendSuporte}
            ladoOposto={suporteEntradas}
            t={t}
            editando={editando}
            vinculando={vinculando}
            onEditarValor={setEditando}
            onMudarValor={setEditando}
            onSalvarValor={salvarEdicao}
            onCancelarValor={() => setEditando(null)}
            onMudarVinculo={(id, outroId) => setVinculando(v => ({ ...v, [id]: outroId }))}
            onVincular={vincular}
          />
        </div>
      )}
    </div>
  )
}

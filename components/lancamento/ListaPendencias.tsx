'use client'
import { useState } from 'react'
import { AlertTriangle, Link2, Pencil, Check, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { TIPOS } from './ExtratoView'
import type { Entrada, ItemPendencia } from './useConciliacao'

const LABEL_ORIGEM: Record<string, string> = { suporte: 'Suporte', genia: 'Financeiro' }

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatData(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

interface Edicao { id: string; valor: string }

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

interface Props {
  itens: ItemPendencia[]
  ladoOposto: Entrada[]
  vazio: string
  onSalvarValor: (id: string, valorNovo: number) => Promise<void>
  onVincular: (principalId: string, outroId: string) => Promise<void>
}

export function ListaPendencias({ itens, ladoOposto, vazio, onSalvarValor, onVincular }: Props) {
  const { t } = useI18n()
  const [editando, setEditando] = useState<Edicao | null>(null)
  const [vinculando, setVinculando] = useState<Record<string, string>>({})

  async function salvar() {
    if (!editando) return
    const valorNum = Number(editando.valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) return
    await onSalvarValor(editando.id, valorNum)
    setEditando(null)
  }

  if (itens.length === 0) {
    return <div className="p-6 text-center text-gray-500 text-sm rounded-xl border border-white/10">{vazio}</div>
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
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
              <Valor e={e} editando={editando} onEditar={setEditando} onMudar={setEditando} onSalvar={salvar} onCancelar={() => setEditando(null)} />
            </div>

            {item.motivo === 'divergencia' && item.par && (
              <div className="flex items-center gap-2 text-xs bg-alert/5 border border-alert/20 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="text-alert shrink-0" />
                <span className="text-gray-400">
                  {LABEL_ORIGEM[item.par.origem]} lançou{' '}
                  <Valor e={item.par} editando={editando} onEditar={setEditando} onMudar={setEditando} onSalvar={salvar} onCancelar={() => setEditando(null)} />
                  {' '}em {formatData(item.par.data_lancamento)} — valores não batem.
                </span>
              </div>
            )}

            {item.motivo === 'sem_par' && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500">{t('conciliacao.sem_par_motivo')}</p>
                <div className="flex items-center gap-2">
                <select
                  value={vinculando[e.id] ?? ''}
                  onChange={ev => setVinculando(v => ({ ...v, [e.id]: ev.target.value }))}
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
                  onClick={async () => { await onVincular(e.id, vinculando[e.id]); setVinculando(v => { const n = { ...v }; delete n[e.id]; return n }) }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-surface2 border border-white/10 rounded-lg text-xs text-gold hover:border-gold/50 disabled:opacity-30 transition-colors"
                >
                  <Link2 size={12} />{t('conciliacao.vincular')}
                </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { getRegras, createRegra, updateRegra, deleteRegra } from '@/lib/cadastro-api'
import { supabase } from '@/lib/supabase'
import { formatIndicadorNome, campoFromCondicoes } from '@/lib/indicadores'
import { resolverLayout, LABEL_CAMPO as LABEL_CAMPO_ACERTO } from '@/lib/relatorio-acerto'
import type { CampoClube, Regra, RegraForm } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { RegraModal } from '@/components/cadastro/RegraModal'
import { VinculosPanel } from '@/components/cadastro/VinculosPanel'
import { Plus, Link2 } from 'lucide-react'

interface IndicadorInfo { nome: string; descricao: string | null }

// Mesmo rótulo usado em VinculosPanel/RegrasAplicadas — sobre qual taxa do
// clube (Fee MTT/Fee Cash/Taxa Operacional/SpinUp) o percentual da regra
// incide, inferido do indicador usado na condição.
const LABEL_CAMPO: Record<CampoClube, string> = {
  fee_mtt: 'Fee MTT', fee_cash: 'Fee Cash', taxa_op: 'Taxa Operacional', spinup: 'SpinUp',
}

// Frase em linguagem simples do que a regra faz — em vez de só "3 faixas",
// pra quem não é técnico entender sem abrir o formulário.
function resumoRegra(r: Regra, indicadores: Map<string, IndicadorInfo>): string {
  if (r.tipo === 'multa_atraso') {
    if (r.faixasMulta.length === 0) return 'Sem faixas ainda'
    return r.faixasMulta.map(f => `${f.quantidade ?? '?'} ${f.unidade} → ${f.percentual ?? '?'}%`).join(', ')
  }
  if (r.tipo === 'layout_acerto') {
    const visiveis = resolverLayout(r.layoutCampos).filter(c => c.visivel)
    return visiveis.map(c => LABEL_CAMPO_ACERTO[c.campo]).join(' → ')
  }
  if (r.condicoes.length === 0) return 'Sem condições ainda'
  return r.condicoes.map(c => {
    if (c.is_fallback) return `SENÃO → ${c.resultado_pct ?? '?'}%`
    const termos = c.indicador_ids
      .filter(Boolean)
      .map(id => { const ind = indicadores.get(id); return ind ? formatIndicadorNome(ind.nome, ind.descricao) : '?' })
      .join(' + ')
    return `SE ${termos || '?'} ${c.operador} ${c.valor ?? '?'} → ${c.resultado_pct ?? '?'}%`
  }).join(', ')
}

export default function RegrasPage() {
  const [items, setItems] = useState<Regra[]>([])
  const [indicadores, setIndicadores] = useState<Map<string, IndicadorInfo>>(new Map())
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Regra | null>(null)
  const [vinculosRegra, setVinculosRegra] = useState<Regra | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Regra | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Busca indicadores junto — se algum foi criado direto no Supabase
      // enquanto essa página já estava aberta, ele aparece assim que a
      // lista de regras recarrega (não só quando a página é recarregada).
      const [regras, { data: ind }] = await Promise.all([
        getRegras(),
        supabase.from('indicadores').select('id, nome, descricao'),
      ])
      setItems(regras)
      setIndicadores(new Map((ind ?? []).map(i => [i.id as string, { nome: i.nome as string, descricao: i.descricao as string | null }])))
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const indicadorNomePorId = useMemo(() => new Map([...indicadores].map(([id, info]) => [id, info.nome])), [indicadores])

  async function handleSave(form: RegraForm) {
    setSaving(true); setError(null)
    try {
      if (editing) {
        await updateRegra(editing.id, form)
        await load()
      } else {
        // Regra nova não serve pra nada até ser vinculada a alguém — em vez
        // de fechar e deixar órfã, já abre o painel de vínculo na sequência.
        const novoId = await createRegra(form)
        const lista = await getRegras()
        setItems(lista)
        const nova = lista.find(r => r.id === novoId)
        if (nova) setVinculosRegra(nova)
      }
      setModalOpen(false); setEditing(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  // Cria uma cópia solta, sem nenhum vínculo — a original (já vinculada a
  // clube/liga) não deixa mais trocar de tipo, então duplicar é o jeito de
  // "experimentar" outro tipo sem mexer no que já tá valendo pra ninguém.
  async function handleDuplicate(regra: Regra) {
    setError(null)
    try {
      await createRegra({ nome: `${regra.nome} (cópia)`, tipo: regra.tipo, condicoes: regra.condicoes, faixasMulta: regra.faixasMulta, layoutCampos: regra.layoutCampos })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteRegra(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Regras</h1>
          <p className="text-sm text-gray-400 mt-1">Faixas SE/ENTÃO reutilizáveis — crie a regra aqui, depois vincule a Ligas, Clubes ou Agentes</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />Nova Regra
        </button>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <CadastroTable
        columns={[
          {
            key: 'nome',
            label: 'Nome',
            render: (v: string, row: Regra) => (
              <button onClick={() => setVinculosRegra(row)} className="text-gold hover:underline text-left">{v}</button>
            ),
          },
          {
            key: 'tipo',
            label: 'O que faz',
            render: (_: string, row: Regra) => {
              const campo = row.tipo === 'faixa' ? campoFromCondicoes(row.condicoes, indicadorNomePorId) : null
              return (
                <span className="text-xs text-gray-300">
                  {row.tipo === 'multa_atraso' && (
                    <span className="mr-2 px-1.5 py-0.5 rounded-full bg-alert/10 border border-alert/30 text-alert text-[10px] align-middle whitespace-nowrap">
                      Multa
                    </span>
                  )}
                  {row.tipo === 'layout_acerto' && (
                    <span className="mr-2 px-1.5 py-0.5 rounded-full bg-blue-400/10 border border-blue-400/30 text-blue-400 text-[10px] align-middle whitespace-nowrap">
                      Layout
                    </span>
                  )}
                  {resumoRegra(row, indicadores)}
                  {campo && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-full bg-surface2 border border-white/10 text-gray-400 text-[10px] align-middle whitespace-nowrap">
                      sobre {LABEL_CAMPO[campo]}
                    </span>
                  )}
                </span>
              )
            },
          },
          {
            key: 'vinculoCount',
            label: 'Vínculos',
            render: (v: number, row: Regra) => (
              <button onClick={() => setVinculosRegra(row)} className={`flex items-center gap-1.5 text-sm transition-colors ${v === 0 ? 'text-gold hover:underline' : 'text-gray-300 hover:text-gold'}`}>
                <Link2 size={13} />{v === 0 ? 'Vincular agora' : v}
              </button>
            ),
          },
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
        onDuplicate={handleDuplicate}
      />

      <RegraModal
        open={modalOpen}
        editing={editing}
        onClose={() => { setModalOpen(false); setEditing(null); setError(null) }}
        onSave={handleSave}
        saving={saving}
        error={error}
      />

      <VinculosPanel
        open={!!vinculosRegra}
        regra={vinculosRegra}
        resumo={vinculosRegra ? resumoRegra(vinculosRegra, indicadores) : undefined}
        indicadorNomePorId={indicadorNomePorId}
        onClose={() => { setVinculosRegra(null); load() }}
      />

      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.nome ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}

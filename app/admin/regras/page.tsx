'use client'
import { useState, useEffect, useCallback } from 'react'
import { getRegras, createRegra, updateRegra, deleteRegra } from '@/lib/cadastro-api'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { formatIndicadorNome } from '@/lib/indicadores'
import { resolverLayout, LABEL_CAMPO as LABEL_CAMPO_ACERTO } from '@/lib/relatorio-acerto'
import type { CampoClube, Regra } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { RegraModal, type RegraModalResult } from '@/components/cadastro/RegraModal'
import { VinculosPanel } from '@/components/cadastro/VinculosPanel'
import { Plus, Link2 } from 'lucide-react'

interface IndicadorInfo { nome: string; descricao: string | null }

// Mesmo rótulo usado em VinculosPanel/RegrasAplicadas — sobre qual taxa do
// clube (Fee MTT/Fee Cash/Taxa Operacional/SpinUp) o percentual da regra
// incide (campo escolhido explicitamente na Regra, não mais inferido).
const LABEL_CAMPO: Record<CampoClube, string> = {
  fee_mtt: 'Rake MTT', fee_cash: 'Rake Cash', taxa_op: 'Taxa Operacional', spinup: 'SpinUp', rake_total: 'Rake', taxa_liga: 'Taxa da Liga',
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
    catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Cálculo, Layout e Multa são editados/criados juntos no mesmo modal
  // agora — Layout e Multa pertencem só a 1 Cálculo (regra_pai_id), sem a
  // ambiguidade de quando eram compartilháveis entre vários. Editando um
  // Cálculo: atualiza ele e cria/atualiza/apaga os filhos conforme o que
  // voltou do modal. Editando uma Multa Avulsa ou um Layout avulso legado
  // (sem mãe): só 1 form mesmo, update direto. Criando: Cálculo nasce
  // primeiro (se tiver) pra virar o pai de Layout/Multa; Multa Avulsa nasce
  // solta, com vínculo próprio.
  async function handleSave(result: RegraModalResult) {
    setSaving(true); setError(null)
    try {
      if (editing) {
        if (editing.tipo === 'faixa') {
          if (result.calculo) await updateRegra(editing.id, result.calculo)
          const layoutFilho = items.find(r => r.regraPaiId === editing.id && r.tipo === 'layout_acerto')
          if (result.layout) {
            if (layoutFilho) await updateRegra(layoutFilho.id, result.layout)
            else await createRegra(result.layout, editing.id)
          }
          const multaFilha = items.find(r => r.regraPaiId === editing.id && r.tipo === 'multa_atraso')
          if (result.multa) {
            if (multaFilha) await updateRegra(multaFilha.id, result.multa)
            else await createRegra(result.multa, editing.id)
          } else if (result.removerMulta && multaFilha) {
            await deleteRegra(multaFilha.id)
          }
        } else {
          const form = result.calculo ?? result.layout ?? result.multa
          if (form) await updateRegra(editing.id, form)
        }
        await load()
      } else {
        // Regra nova não serve pra nada até ser vinculada a alguém — em vez
        // de fechar e deixar órfã, já abre o painel de vínculo da mãe (ou da
        // própria Multa Avulsa, se for o caso).
        const paiId = result.calculo ? await createRegra(result.calculo) : null
        const novosIds: string[] = paiId ? [paiId] : []
        if (result.layout) novosIds.push(await createRegra(result.layout, paiId))
        if (result.multa) novosIds.push(await createRegra(result.multa, paiId))
        const lista = await getRegras()
        setItems(lista)
        const primeira = lista.find(r => r.id === novosIds[0])
        if (primeira) setVinculosRegra(primeira)
      }
      setModalOpen(false); setEditing(null)
    } catch (e) { setError(errMsg(e)) }
    finally { setSaving(false) }
  }

  // Cria uma cópia solta, sem nenhum vínculo — jeito rápido de partir de uma
  // regra parecida sem mexer na original, que já pode estar valendo pra
  // alguém. Duplicando um Cálculo, o Layout/Multa anexados a ele vêm junto
  // (anexados à cópia) — é o jeito de reusar um Layout/Multa noutro lugar,
  // já que agora pertencem só a 1 Cálculo (não dá pra vincular o mesmo em 2).
  async function handleDuplicate(regra: Regra) {
    setError(null)
    try {
      if (regra.tipo === 'faixa') {
        const paiId = await createRegra({ nome: `${regra.nome} (cópia)`, tipo: 'faixa', campo: regra.campo, condicoes: regra.condicoes, faixasMulta: [], layoutCampos: [] })
        const layoutFilho = items.find(r => r.regraPaiId === regra.id && r.tipo === 'layout_acerto')
        if (layoutFilho) await createRegra({ nome: 'Layout do Acerto', tipo: 'layout_acerto', campo: null, condicoes: [], faixasMulta: [], layoutCampos: layoutFilho.layoutCampos }, paiId)
        const multaFilha = items.find(r => r.regraPaiId === regra.id && r.tipo === 'multa_atraso')
        if (multaFilha) await createRegra({ nome: `${regra.nome} (cópia)`, tipo: 'multa_atraso', campo: null, condicoes: [], faixasMulta: multaFilha.faixasMulta, layoutCampos: [] }, paiId)
      } else {
        // Layout do Acerto não tem nome digitado — fica sempre com o mesmo
        // nome fixo, a cópia também (ver RegraModal.tsx).
        const nome = regra.tipo === 'layout_acerto' ? 'Layout do Acerto' : `${regra.nome} (cópia)`
        await createRegra({ nome, tipo: regra.tipo, campo: regra.campo, condicoes: regra.condicoes, faixasMulta: regra.faixasMulta, layoutCampos: regra.layoutCampos })
      }
      await load()
    } catch (e) { setError(errMsg(e)) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteRegra(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e) { setError(errMsg(e)) }
    finally { setSaving(false) }
  }

  // Layout/Multa anexados (regra_pai_id) a um Cálculo não aparecem como
  // linha própria — pertencem só a ele, são editados junto no mesmo modal
  // (ver RegraModal). Só sobra na lista: Cálculos, Multa Avulsa e qualquer
  // Layout avulso legado (de antes da Regra "mãe" existir).
  const itemsTopo = items.filter(r => r.regraPaiId === null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Regras</h1>
          <p className="text-sm text-gray-400 mt-1">Cálculo, Layout e Multa de Acerto — crie/edite tudo junto aqui, depois vincule a Ligas, Clubes ou Agentes</p>
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
              const campo = row.tipo === 'faixa' ? row.campo : null
              const temLayout = row.tipo === 'faixa' && items.some(r => r.regraPaiId === row.id && r.tipo === 'layout_acerto')
              const temMulta = row.tipo === 'faixa' && items.some(r => r.regraPaiId === row.id && r.tipo === 'multa_atraso')
              return (
                <span className="text-xs text-gray-300">
                  {resumoRegra(row, indicadores)}
                  {campo && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-full bg-surface2 border border-white/10 text-gray-400 text-[10px] align-middle whitespace-nowrap">
                      sobre {LABEL_CAMPO[campo]}
                    </span>
                  )}
                  {temLayout && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface2 border border-white/10 text-gray-400 text-[10px] align-middle whitespace-nowrap">+ Layout</span>}
                  {temMulta && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface2 border border-white/10 text-gray-400 text-[10px] align-middle whitespace-nowrap">+ Multa</span>}
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
        data={itemsTopo}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
        onDuplicate={handleDuplicate}
      />

      <RegraModal
        open={modalOpen}
        editing={editing}
        layoutFilho={editing?.tipo === 'faixa' ? items.find(r => r.regraPaiId === editing.id && r.tipo === 'layout_acerto') ?? null : null}
        multaFilha={editing?.tipo === 'faixa' ? items.find(r => r.regraPaiId === editing.id && r.tipo === 'multa_atraso') ?? null : null}
        onClose={() => { setModalOpen(false); setEditing(null); setError(null) }}
        onSave={handleSave}
        saving={saving}
        error={error}
      />

      <VinculosPanel
        open={!!vinculosRegra}
        regra={vinculosRegra}
        resumo={vinculosRegra ? resumoRegra(vinculosRegra, indicadores) : undefined}
        onClose={() => { setVinculosRegra(null); load() }}
      />

      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.nome ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}

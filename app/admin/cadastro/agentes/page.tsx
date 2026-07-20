'use client'
import { useState, useEffect, useCallback } from 'react'
import { getAgentes, createAgente, updateAgente, deleteAgente, syncAgentePlataformas, syncClubeAgentes, syncSubAgentes, getPlataformas } from '@/lib/cadastro-api'
import type { Agente, AgenteForm, AgentePlataforma, Plataforma, ClubeVinculado } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { AgenteModal } from '@/components/cadastro/AgenteModal'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Condicao {
  indicador_id: string
  operador: string
  valor: number | null
  resultado_pct: number | null
  is_fallback: boolean
}

export default function AgentesPage() {
  const [items, setItems] = useState<Agente[]>([])
  const [plataformas, setPlataformas] = useState<Plataforma[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Agente | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agente | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, p] = await Promise.all([getAgentes(filter || undefined), getPlataformas()])
      setItems(a); setPlataformas(p)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const vinculosIniciais = (item: Agente | null): AgentePlataforma[] =>
    item?.agente_plataformas?.map(v => ({
      id: v.id, agente_id: item.id, plataforma_id: v.plataforma_id, external_id: v.external_id, nickname: v.nickname,
    })) ?? []

  const clubesIniciais = (item: Agente | null): ClubeVinculado[] =>
    item?.clube_agentes?.map(ca => ({
      id: ca.clube_id,
      name: ca.clubs?.name ?? '—',
      external_id: ca.clubs?.external_id ?? null,
      plataforma_id: ca.clubs?.plataforma_id ?? null,
      leagueName: ca.clubs?.leagues?.name ?? null,
    })) ?? []

  // Sub-agentes = outros registros de `items` que apontam pra este via superagente_id
  const subAgentesIniciais = (item: Agente | null): { id: string; nome: string; email: string | null }[] =>
    item ? items.filter(a => a.superagente_id === item.id).map(a => ({ id: a.id, nome: a.nome, email: a.email })) : []

  const handleSave = async (form: AgenteForm, vinculos: AgentePlataforma[], clubeIds: string[], condicoes: Condicao[], subAgenteIds: string[]) => {
    setSaving(true); setError(null)
    try {
      let agenteId: string
      if (editing) {
        await updateAgente(editing.id, form)
        agenteId = editing.id
      } else {
        const created = await createAgente(form)
        agenteId = created.id
      }

      await syncAgentePlataformas(agenteId, vinculos, vinculosIniciais(editing))
      await syncClubeAgentes(agenteId, clubeIds, clubesIniciais(editing).map(c => c.id))
      await syncSubAgentes(agenteId, subAgenteIds, subAgentesIniciais(editing).map(a => a.id))

      const { data: existingRE } = await supabase
        .from('regra_entidades')
        .select('regra_id')
        .eq('entidade_tipo', 'agente')
        .eq('entidade_id', agenteId)
        .maybeSingle()

      if (condicoes.length > 0) {
        let regraId: string
        if (existingRE) {
          regraId = existingRE.regra_id
          const { error: delErr } = await supabase.from('regra_condicoes').delete().eq('regra_id', regraId)
          if (delErr) throw delErr
        } else {
          const { data: novaRegra, error: regraErr } = await supabase
            .from('regras')
            .insert({ nome: `Rakeback — ${form.nome}` })
            .select().single()
          if (regraErr) throw regraErr
          regraId = novaRegra.id
          const { error: reErr } = await supabase.from('regra_entidades').insert({ regra_id: regraId, entidade_tipo: 'agente', entidade_id: agenteId, prioridade: 0 })
          if (reErr) throw reErr
        }
        const { error: condErr } = await supabase.from('regra_condicoes').insert(
          condicoes.map((c, i) => ({
            regra_id: regraId,
            ordem: i + 1,
            indicador_id: c.indicador_id || null,
            operador: c.is_fallback ? '>=' : c.operador,
            valor: c.is_fallback ? 0 : c.valor,
            resultado_pct: c.resultado_pct,
            is_fallback: c.is_fallback,
          }))
        )
        if (condErr) throw condErr
      } else if (existingRE) {
        const { error: delCondErr } = await supabase.from('regra_condicoes').delete().eq('regra_id', existingRE.regra_id)
        if (delCondErr) throw delCondErr
        const { error: delReErr } = await supabase.from('regra_entidades').delete().eq('regra_id', existingRE.regra_id)
        if (delReErr) throw delReErr
        const { error: delRegraErr } = await supabase.from('regras').delete().eq('id', existingRE.regra_id)
        if (delRegraErr) throw delRegraErr
      }

      await load(); setModalOpen(false); setEditing(null)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteAgente(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agentes</h1>
          <p className="text-sm text-gray-400 mt-1">Responsáveis pelos jogadores dentro de cada clube</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />Novo Agente
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text" value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Buscar por nome..."
          className="bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/50 w-64"
        />
        <span className="text-sm text-gray-500">{items.length} agente{items.length !== 1 ? 's' : ''}</span>
      </div>

      {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'nome', label: 'Nome' },
          { key: 'email', label: 'Email', render: (v: string) => v ?? '—' },
          {
            key: 'agente_plataformas', label: 'Plataformas',
            render: (v: Agente['agente_plataformas']) => v?.length ? v.map(p => p.plataformas?.nome).filter(Boolean).join(', ') : '—',
          },
          {
            key: 'clube_agentes', label: 'Clubes',
            render: (v: Agente['clube_agentes']) => v?.length ? `${v.length} clube${v.length !== 1 ? 's' : ''}` : '—',
          },
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <AgenteModal
        open={modalOpen}
        editing={editing}
        vinculosIniciais={vinculosIniciais(editing)}
        clubesVinculadosIniciais={clubesIniciais(editing)}
        subAgentesIniciais={subAgentesIniciais(editing)}
        plataformas={plataformas}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
      />
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.nome ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}
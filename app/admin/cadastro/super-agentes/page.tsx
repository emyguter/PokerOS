'use client'
import { useState, useEffect, useCallback } from 'react'
import { getAgentes, createAgente, updateAgente, syncAgentePlataformas, syncClubeAgentes, syncSubAgentes, getPlataformas } from '@/lib/cadastro-api'
import type { Agente, AgenteForm, AgentePlataforma, Plataforma, ClubeVinculado } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
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

export default function SuperAgentesPage() {
  const [todos, setTodos] = useState<Agente[]>([])
  const [plataformas, setPlataformas] = useState<Plataforma[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Agente | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, p] = await Promise.all([getAgentes(), getPlataformas()])
      setTodos(a); setPlataformas(p)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Super Agente = agente que aparece como superagente_id de pelo menos um outro
  const superAgentes = todos.filter(a => todos.some(o => o.superagente_id === a.id))
  const subAgentesDe = (id: string) => todos.filter(o => o.superagente_id === id).map(o => ({ id: o.id, nome: o.nome, email: o.email }))

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
      await syncSubAgentes(agenteId, subAgenteIds, editing ? subAgentesDe(editing.id).map(a => a.id) : [])

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Super Agentes</h1>
          <p className="text-sm text-gray-400 mt-1">Agentes que têm outros agentes vinculados abaixo</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />Novo Agente
        </button>
      </div>

      <p className="text-xs text-gray-500">
        {superAgentes.length} super agente{superAgentes.length !== 1 ? 's' : ''} · Pra promover um Agente comum a Super Agente, vincule outro Agente a ele em "Sub-Agentes".
      </p>

      {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'nome', label: 'Nome' },
          { key: 'email', label: 'Email', render: (v: string) => v ?? '—' },
          { key: 'id', label: 'Agentes abaixo', render: (v: string) => `${subAgentesDe(v).length} agente${subAgentesDe(v).length !== 1 ? 's' : ''}` },
        ]}
        data={superAgentes}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={() => {}}
      />

      <AgenteModal
        open={modalOpen}
        editing={editing}
        vinculosIniciais={vinculosIniciais(editing)}
        clubesVinculadosIniciais={clubesIniciais(editing)}
        subAgentesIniciais={editing ? subAgentesDe(editing.id) : []}
        plataformas={plataformas}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  )
}
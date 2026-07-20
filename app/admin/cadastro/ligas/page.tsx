'use client'
import { useState, useEffect, useCallback } from 'react'
import { getLeagues, createLeague, updateLeague, deleteLeague, getSuperLeagues, getPlataformas } from '@/lib/cadastro-api'
import type { League, LeagueForm, SuperLeague, Plataforma } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { LeagueModal } from '@/components/cadastro/LeagueModal'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Condicao {
  indicador_ids: string[]
  operador: string
  valor: number | null
  resultado_pct: number | null
  is_fallback: boolean
}

const EMPTY: LeagueForm = {
  name: '', moeda: 'BRL', taxa_app_pct: null, ratio: null, super_league_id: null,
  plataforma_id: null, clube_ext_id: null, clube_nickname: null,
  operador_ext_id: null, operador_nickname: null, moeda_acerto: 'BRL', conversao_dia: false
}

export default function LigasPage() {
  const [items, setItems] = useState<League[]>([])
  const [superLeagues, setSuperLeagues] = useState<SuperLeague[]>([])
  const [plataformas, setPlataformas] = useState<Plataforma[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<League | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<League | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, sl, pl] = await Promise.all([getLeagues(), getSuperLeagues(), getPlataformas()])
      setItems(l); setSuperLeagues(sl); setPlataformas(pl)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: LeagueForm, condicoes: Condicao[]) => {
    setSaving(true); setError(null)
    try {
      let leagueId: string
      if (editing) {
        await updateLeague(editing.id, form)
        leagueId = editing.id
      } else {
        const created = await createLeague(form)
        leagueId = created.id
      }

      // Salva regras se houver condições
      if (condicoes.length > 0) {
        // Busca regra existente pra esta liga
        const { data: existingRE } = await supabase
          .from('regra_entidades')
          .select('regra_id')
          .eq('entidade_tipo', 'liga')
          .eq('entidade_id', leagueId)
          .maybeSingle()

        let regraId: string

        if (existingRE) {
          regraId = existingRE.regra_id
          // Limpa condições antigas
          const { error: delErr } = await supabase.from('regra_condicoes').delete().eq('regra_id', regraId)
          if (delErr) throw delErr
        } else {
          // Cria regra nova
          const { data: novaRegra, error: regraErr } = await supabase
            .from('regras')
            .insert({ nome: `Taxa App — ${form.name}`, moeda: form.moeda_acerto, conversao_dia: form.conversao_dia })
            .select().single()
          if (regraErr) throw regraErr
          regraId = novaRegra.id
          const { error: reErr } = await supabase.from('regra_entidades').insert({ regra_id: regraId, entidade_tipo: 'liga', entidade_id: leagueId, prioridade: 1 })
          if (reErr) throw reErr
        }

        // Insere condições
        const { data: condRows, error: condErr } = await supabase.from('regra_condicoes').insert(
          condicoes.map((c, i) => ({
            regra_id: regraId,
            ordem: i + 1,
            operador: c.is_fallback ? '=' : c.operador,
            valor: c.is_fallback ? 0 : c.valor,
            resultado_pct: c.resultado_pct,
            is_fallback: c.is_fallback,
          }))
        ).select('id')
        if (condErr) throw condErr

        // Insere os termos (indicadores somados) de cada condição
        const termos = condicoes.flatMap((c, i) =>
          c.is_fallback ? [] : c.indicador_ids
            .filter(Boolean)
            .map((indicadorId, ti) => ({ regra_condicao_id: condRows[i].id, indicador_id: indicadorId, ordem: ti + 1 }))
        )
        if (termos.length > 0) {
          const { error: termosErr } = await supabase.from('regra_condicao_termos').insert(termos)
          if (termosErr) throw termosErr
        }
      }

      await load(); setModalOpen(false); setEditing(null)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteLeague(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Ligas</h1>
          <p className="text-sm text-gray-400 mt-1">Cada liga é um cliente da plataforma</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />Nova Liga
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'name', label: 'Nome' },
          { key: 'moeda', label: 'Moeda' },
          { key: 'plataformas', label: 'Plataforma', render: (_: any, row: League) => row.super_leagues?.plataformas?.nome ?? '—' },
          { key: 'super_leagues', label: 'Superliga', render: (_: any, row: League) => row.super_leagues?.name ?? '—' },
          { key: 'conversao_dia', label: 'Conv. Dia', render: (v: boolean) => v ? '✓' : '—' },
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <LeagueModal
        open={modalOpen}
        editing={editing}
        superLeagues={superLeagues}
        plataformas={plataformas}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
      />

      <ConfirmDelete
        open={!!deleteTarget}
        name={deleteTarget?.name ?? ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        saving={saving}
      />
    </div>
  )
}
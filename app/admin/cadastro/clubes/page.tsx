'use client'
import { useState, useEffect, useCallback } from 'react'
import { getClubs, createClub, updateClub, deleteClub, getLeagues, getPlataformas } from '@/lib/cadastro-api'
import type { Club, ClubForm, League, Plataforma } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { ClubModal } from '@/components/cadastro/ClubModal'
import { Plus, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Condicao {
  indicador_id: string
  operador: string
  valor: number | null
  resultado_pct: number | null
  is_fallback: boolean
}

function clean(form: ClubForm): ClubForm {
  const f = { ...form }
  if (f.settlement_type === 'rakeback') { f.fee_mtt_pct = null; f.fee_cash_pct = null; f.spinup_pct = null; f.crypto_rebate_pct = null; f.taxa_variavel_nome = null; f.taxa_variavel_indicador = null; f.taxa_variavel_regra = null }
  if (f.settlement_type === 'weekly_usd') { f.fee_cash_pct = null; f.spinup_pct = null; f.rakeback_pct = null }
  if (f.settlement_type === 'dinamico') { f.crypto_rebate_pct = null; f.rakeback_pct = null }
  if (f.taxa_tipo === 'fixa') { f.taxa_variavel_nome = null; f.taxa_variavel_indicador = null; f.taxa_variavel_regra = null }
  if (!f.rebate_ativo) f.rebate_pct = null
  return f
}

export default function ClubesPage() {
  const [items, setItems] = useState<Club[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [plataformas, setPlataformas] = useState<Plataforma[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Club | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Club | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, l, p] = await Promise.all([getClubs(filter || undefined), getLeagues(), getPlataformas()])
      setItems(c); setLeagues(l); setPlataformas(p)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: ClubForm, condicoes: Condicao[]) => {
    setSaving(true); setError(null)
    try {
      let clubId: string
      if (editing) {
        await updateClub(editing.id, clean(form))
        clubId = editing.id
      } else {
        const created = await createClub(clean(form))
        clubId = created.id
      }

      if (!form.league_id) {
        if (condicoes.length > 0) {
          const { data: existingRE } = await supabase
            .from('regra_entidades')
            .select('regra_id')
            .eq('entidade_tipo', 'clube')
            .eq('entidade_id', clubId)
            .maybeSingle()

          let regraId: string
          if (existingRE) {
            regraId = existingRE.regra_id
            await supabase.from('regra_condicoes').delete().eq('regra_id', regraId)
          } else {
            const { data: novaRegra } = await supabase
              .from('regras')
              .insert({ nome: `Ajuste — ${form.name}` })
              .select().single()
            regraId = novaRegra!.id
            await supabase.from('regra_entidades').insert({ regra_id: regraId, entidade_tipo: 'clube', entidade_id: clubId, prioridade: 0 })
          }

          await supabase.from('regra_condicoes').insert(
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
        }
      }

      await load(); setModalOpen(false); setEditing(null)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteClub(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Clubes</h1>
          <p className="text-sm text-gray-400 mt-1">Entidade principal — regras financeiras por clube</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />Novo Clube
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Filter size={16} className="text-gray-400" />
        <select value={filter} onChange={e => setFilter(e.target.value)} className="bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50">
          <option value="">Todas as ligas</option>
          {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <span className="text-sm text-gray-500">{items.length} clube{items.length !== 1 ? 's' : ''}</span>
      </div>

      {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'name', label: 'Nome' },
          { key: 'external_id', label: 'ID App', render: (v: string) => v ?? '—' },
          { key: 'leagues', label: 'Liga', render: (_: any, row: Club) => row.leagues?.name ?? '—' },
          { key: 'moeda', label: 'Moeda' },
          { key: 'rebate_ativo', label: 'Rebate', render: (v: boolean, row: Club) => v ? `${row.rebate_pct ?? 0}%` : '—' },
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <ClubModal
        open={modalOpen}
        editing={editing}
        leagues={leagues}
        plataformas={plataformas}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
      />
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}
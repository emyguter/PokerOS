'use client'
import { useState, useEffect, useCallback } from 'react'
import { getLeagues, createLeague, updateLeague, deleteLeague, getSuperLeagues } from '@/lib/cadastro-api'
import type { League, LeagueForm, SuperLeague } from '@/lib/types'
import { CadastroModal } from '@/components/cadastro/CadastroModal'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { Plus } from 'lucide-react'

const EMPTY: LeagueForm = { name: '', moeda: 'BRL', taxa_app_pct: null, ratio: null, super_league_id: null }

export default function LigasPage() {
  const [items, setItems] = useState<League[]>([])
  const [superLeagues, setSuperLeagues] = useState<SuperLeague[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<League | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<League | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, sl] = await Promise.all([getLeagues(), getSuperLeagues()])
      setItems(l); setSuperLeagues(sl)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: LeagueForm) => {
    setSaving(true); setError(null)
    try {
      editing ? await updateLeague(editing.id, form) : await createLeague(form)
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

  const slOptions = [{ value: '', label: '— Nenhuma —' }, ...superLeagues.map(sl => ({ value: sl.id, label: sl.name }))]

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
          { key: 'taxa_app_pct', label: 'Taxa App %', render: (v: number) => v != null ? `${v}%` : '—' },
          { key: 'ratio', label: 'Ratio', render: (v: number) => v ?? '—' },
          { key: 'super_leagues', label: 'Superliga', render: (_: any, row: League) => row.super_leagues?.name ?? '—' }
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <CadastroModal
        open={modalOpen}
        title={editing ? 'Editar Liga' : 'Nova Liga'}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
        initialData={editing ? { name: editing.name, moeda: editing.moeda, taxa_app_pct: editing.taxa_app_pct, ratio: editing.ratio, super_league_id: editing.super_league_id } : EMPTY}
        fields={[
          { key: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'Ex: LP, ORION, SUL_HG' },
          { key: 'moeda', label: 'Moeda', type: 'select', required: true, options: [{ value: 'BRL', label: 'BRL — Real' }, { value: 'USD', label: 'USD — Dólar' }] },
          { key: 'taxa_app_pct', label: 'Taxa do App (%)', type: 'number', placeholder: 'Ex: 9' },
          { key: 'ratio', label: 'Ratio de conversão', type: 'number', placeholder: 'Ex: 1' },
          { key: 'super_league_id', label: 'Superliga', type: 'select', options: slOptions }
        ]}
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
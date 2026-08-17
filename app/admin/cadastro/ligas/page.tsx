'use client'
import { useState, useEffect, useCallback } from 'react'
import { getLeagues, createLeague, updateLeague, deleteLeague, getSuperLeagues, getPlataformas } from '@/lib/cadastro-api'
import type { League, LeagueForm, SuperLeague, Plataforma } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { LeagueModal } from '@/components/cadastro/LeagueModal'
import { Plus } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const EMPTY: LeagueForm = {
  name: '', moeda: 'BRL', taxa_app_pct: null, ratio: null, super_league_id: null,
  plataforma_id: null, clube_ext_id: null, clube_nickname: null,
  operador_ext_id: null, operador_nickname: null,
  projeto: null,
}

export default function LigasPage() {
  const { t } = useI18n()
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

  const handleSave = async (form: LeagueForm) => {
    setSaving(true); setError(null)
    try {
      if (editing) await updateLeague(editing.id, form)
      else await createLeague(form)
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
          <h1 className="text-2xl font-semibold text-white">{t('ligas.titulo')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('ligas.subtitulo')}</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />{t('ligas.novo')}
        </button>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'name', label: 'Nome' },
          { key: 'moeda', label: 'Moeda' },
          { key: 'plataformas', label: 'Plataforma', render: (_: any, row: League) => row.super_leagues?.plataformas?.nome ?? '—' },
          { key: 'super_leagues', label: 'Superliga', render: (_: any, row: League) => row.super_leagues?.name ?? '—' },
          { key: 'projeto', label: 'Projeto', render: (v: string | null) => v ?? '—' },
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
        onClose={() => { setModalOpen(false); setEditing(null); setError(null) }}
        onSave={handleSave}
        saving={saving}
        error={error}
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
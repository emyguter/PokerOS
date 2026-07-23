'use client'
import { useState, useEffect, useCallback } from 'react'
import { getSuperLeagues, createSuperLeague, updateSuperLeague, deleteSuperLeague, getMegaLigas } from '@/lib/cadastro-api'
import type { SuperLeague, SuperLeagueForm, MegaLiga } from '@/lib/types'
import { CadastroModal } from '@/components/cadastro/CadastroModal'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { Plus } from 'lucide-react'
import { MOEDAS } from '@/lib/moedas'
import { useI18n } from '@/lib/i18n'

const EMPTY: SuperLeagueForm = { name: '', moeda: 'USD', plataforma_id: null, mega_liga_id: null }

export default function SuperLigasPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<SuperLeague[]>([])
  const [megaLigas, setMegaLigas] = useState<MegaLiga[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SuperLeague | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SuperLeague | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sl, ml] = await Promise.all([getSuperLeagues(), getMegaLigas()])
      setItems(sl); setMegaLigas(ml)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: SuperLeagueForm) => {
    setSaving(true); setError(null)
    try {
      editing ? await updateSuperLeague(editing.id, form) : await createSuperLeague(form)
      await load(); setModalOpen(false); setEditing(null)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteSuperLeague(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const mlOptions = [
    { value: '', label: '— Nenhuma —' },
    ...megaLigas.map(ml => ({ value: ml.id, label: ml.nome }))
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('superligas.titulo')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('superligas.subtitulo')}</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />{t('superligas.novo')}
        </button>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'name', label: 'Nome' },
          { key: 'moeda', label: 'Moeda' },
          { key: 'plataformas', label: 'Plataforma', render: (_: any, row: SuperLeague) => row.plataformas?.nome ?? '—' },
          { key: 'mega_ligas', label: 'Mega Liga', render: (_: any, row: SuperLeague) => row.mega_ligas?.nome ?? '—' },
          { key: 'created_at', label: 'Criado em', render: (v: string) => new Date(v).toLocaleDateString('pt-BR') }
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <CadastroModal
        open={modalOpen}
        title={editing ? 'Editar Superliga' : 'Nova Superliga'}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
        initialData={editing ? { name: editing.name, moeda: editing.moeda, plataforma_id: editing.plataforma_id, mega_liga_id: editing.mega_liga_id } : EMPTY}
        fields={[
          { key: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'Ex: Grupo Brasil' },
          { key: 'moeda', label: 'Moeda', type: 'select', required: true, options: MOEDAS },
          { key: 'mega_liga_id', label: 'Mega Liga', type: 'select', options: mlOptions }
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
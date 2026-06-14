'use client'
import { useState, useEffect, useCallback } from 'react'
import { getMegaLigas, createMegaLiga, updateMegaLiga, deleteMegaLiga } from '@/lib/cadastro-api'
import type { MegaLiga, MegaLigaForm } from '@/lib/types'
import { CadastroModal } from '@/components/cadastro/CadastroModal'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { Plus } from 'lucide-react'
import { MOEDAS } from '@/lib/moedas'

const EMPTY: MegaLigaForm = { nome: '', moeda: 'USD' }

export default function MegaLigasPage() {
  const [items, setItems] = useState<MegaLiga[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MegaLiga | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MegaLiga | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await getMegaLigas()) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: MegaLigaForm) => {
    setSaving(true); setError(null)
    try {
      editing ? await updateMegaLiga(editing.id, form) : await createMegaLiga(form)
      await load(); setModalOpen(false); setEditing(null)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteMegaLiga(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Mega Ligas</h1>
          <p className="text-sm text-gray-400 mt-1">Agrupa múltiplas superligas</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />Nova Mega Liga
        </button>
      </div>

      {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'nome', label: 'Nome' },
          { key: 'moeda', label: 'Moeda' },
          { key: 'created_at', label: 'Criado em', render: (v: string) => new Date(v).toLocaleDateString('pt-BR') }
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <CadastroModal
        open={modalOpen}
        title={editing ? 'Editar Mega Liga' : 'Nova Mega Liga'}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
        initialData={editing ?? EMPTY}
        fields={[
          { key: 'nome', label: 'Nome', type: 'text', required: true, placeholder: 'Ex: Super Group' },
          { key: 'moeda', label: 'Moeda', type: 'select', required: true, options: MOEDAS }
        ]}
      />

      <ConfirmDelete
        open={!!deleteTarget}
        name={deleteTarget?.nome ?? ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        saving={saving}
      />
    </div>
  )
}
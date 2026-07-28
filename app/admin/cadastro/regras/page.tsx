'use client'
import { useState, useEffect, useCallback } from 'react'
import { getRegras, createRegra, updateRegra, deleteRegra } from '@/lib/cadastro-api'
import type { Regra, RegraCondicaoForm } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { RegraModal } from '@/components/cadastro/RegraModal'
import { VinculosPanel } from '@/components/cadastro/VinculosPanel'
import { Plus, Link2 } from 'lucide-react'

export default function RegrasPage() {
  const [items, setItems] = useState<Regra[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Regra | null>(null)
  const [vinculosRegra, setVinculosRegra] = useState<Regra | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Regra | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await getRegras()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave(nome: string, condicoes: RegraCondicaoForm[]) {
    setSaving(true); setError(null)
    try {
      if (editing) await updateRegra(editing.id, nome, condicoes)
      else await createRegra(nome, condicoes)
      await load(); setModalOpen(false); setEditing(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
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
          { key: 'condicoes', label: 'Condições', render: (v: RegraCondicaoForm[]) => `${v.length} faixa${v.length !== 1 ? 's' : ''}` },
          {
            key: 'vinculoCount',
            label: 'Vínculos',
            render: (v: number, row: Regra) => (
              <button onClick={() => setVinculosRegra(row)} className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-gold transition-colors">
                <Link2 size={13} />{v}
              </button>
            ),
          },
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
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
        onClose={() => { setVinculosRegra(null); load() }}
      />

      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.nome ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { getAgentes, createAgente, updateAgente, syncSubAgentes } from '@/lib/cadastro-api'
import type { Agente, AgenteForm } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { SuperAgenteModal } from '@/components/cadastro/SuperAgenteModal'
import { Plus } from 'lucide-react'

export default function SuperAgentesPage() {
  const [todos, setTodos] = useState<Agente[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Agente | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTodos(await getAgentes()) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const superAgentes = todos.filter(a => todos.some(o => o.superagente_id === a.id))
  const subAgentesDe = (id: string) => todos.filter(o => o.superagente_id === id).map(o => ({ id: o.id, nome: o.nome, email: o.email }))

  const handleSave = async (form: AgenteForm, subAgenteIds: string[]) => {
    setSaving(true); setError(null)
    try {
      const id = editing ? editing.id : (await createAgente(form)).id
      if (editing) await updateAgente(editing.id, form)
      const iniciais = editing ? subAgentesDe(editing.id).map(a => a.id) : []
      await syncSubAgentes(id, subAgenteIds, iniciais)
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
          <Plus size={16} />Novo Super Agente
        </button>
      </div>

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

      <SuperAgenteModal
        open={modalOpen}
        editing={editing}
        subAgentesIniciais={editing ? subAgentesDe(editing.id) : []}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  )
}
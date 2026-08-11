'use client'
import { useState, useEffect, useCallback } from 'react'
import { getMoedasCotacao, createMoedaCotacao, updateMoedaCotacao, deleteMoedaCotacao } from '@/lib/cadastro-api'
import type { MoedaCotacao, MoedaCotacaoForm } from '@/lib/types'
import { CadastroModal } from '@/components/cadastro/CadastroModal'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { Plus } from 'lucide-react'
import { MOEDAS } from '@/lib/moedas'

const EMPTY: MoedaCotacaoForm = { moeda: 'USD', tipo: 'padrao', valor: null }

const TIPO_OPCOES = [
  { value: 'padrao', label: 'Padrão — fica valendo até trocar manualmente' },
  { value: 'cotacao_dia', label: 'Cotação do Dia — pede confirmação toda vez que for calcular' },
]

export default function MoedasPage() {
  const [items, setItems] = useState<MoedaCotacao[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MoedaCotacao | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MoedaCotacao | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await getMoedasCotacao()) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (form: MoedaCotacaoForm) => {
    setSaving(true); setError(null)
    try {
      editing ? await updateMoedaCotacao(editing.id, form) : await createMoedaCotacao(form)
      await load(); setModalOpen(false); setEditing(null)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteMoedaCotacao(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Moedas</h1>
          <p className="text-sm text-gray-400 mt-1">Taxa de câmbio usada quando uma Liga tem “Conversão do dia” ativada</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />Nova Moeda
        </button>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'moeda', label: 'Moeda' },
          { key: 'tipo', label: 'Tipo', render: (v: string) => v === 'cotacao_dia' ? 'Cotação do Dia' : 'Padrão' },
          { key: 'valor', label: 'Valor', render: (v: number | null) => v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—' },
          { key: 'atualizado_em', label: 'Atualizado em', render: (v: string | null) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—' },
        ]}
        data={items}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <CadastroModal
        open={modalOpen}
        title={editing ? 'Editar Moeda' : 'Nova Moeda'}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
        initialData={editing ?? EMPTY}
        fields={[
          { key: 'moeda', label: 'Moeda', type: 'select', required: true, options: MOEDAS },
          { key: 'tipo', label: 'Tipo', type: 'select', required: true, options: TIPO_OPCOES },
          { key: 'valor', label: 'Valor (1 unidade dessa moeda = X BRL)', type: 'number', placeholder: 'Ex: 6' },
        ]}
      />

      <ConfirmDelete
        open={!!deleteTarget}
        name={deleteTarget?.moeda ?? ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        saving={saving}
      />
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { getClubs, createClub, updateClub, deleteClub, getLeagues, getPlataformas, initStoplossAtual } from '@/lib/cadastro-api'
import type { Club, ClubForm, League, Plataforma } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { ClubModal } from '@/components/cadastro/ClubModal'
import { Plus, Filter } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

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
  const { t } = useI18n()
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

  const handleSave = async (form: ClubForm) => {
    setSaving(true); setError(null)
    try {
      const stoplossEraNulo = !editing || editing.stoploss_inicial == null
      const formLimpo = clean(form)
      const saved = editing ? await updateClub(editing.id, formLimpo) : await createClub(formLimpo)
      if (stoplossEraNulo && formLimpo.stoploss_inicial != null) await initStoplossAtual(saved.id, formLimpo.stoploss_inicial)
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
          <h1 className="text-2xl font-semibold text-white">{t('clubes.titulo')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('clubes.subtitulo')}</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />{t('clubes.novo')}
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

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

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
        onClose={() => { setModalOpen(false); setEditing(null); setError(null) }}
        onSave={handleSave}
        saving={saving}
        error={error}
      />
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}
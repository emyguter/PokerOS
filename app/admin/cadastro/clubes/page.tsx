'use client'
import { useState, useEffect, useCallback } from 'react'
import { getClubs, createClub, updateClub, deleteClub, getLeagues } from '@/lib/cadastro-api'
import type { Club, ClubForm, League } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { ClubModal } from '@/components/cadastro/ClubModal'
import { Plus, Filter } from 'lucide-react'
const EMPTY: ClubForm = { league_id: null, name: '', external_id: null, settlement_type: 'dinamico', moeda: 'BRL', taxa_tipo: 'fixa', fee_mtt_pct: null, fee_cash_pct: null, taxa_op_pct: 9, taxa_op_tipo: 'fixa', spinup_pct: null, rebate_pct: null, crypto_rebate_pct: null, rakeback_pct: null, security: null, taxa_variavel_nome: null, taxa_variavel_indicador: null, taxa_variavel_regra: null, caucao_atual: null, stoploss_inicial: null }
function clean(form: ClubForm): ClubForm {
  const f = { ...form }
  if (f.settlement_type === 'rakeback') { f.fee_mtt_pct = null; f.fee_cash_pct = null; f.spinup_pct = null; f.rebate_pct = null; f.crypto_rebate_pct = null; f.taxa_variavel_nome = null; f.taxa_variavel_indicador = null; f.taxa_variavel_regra = null }
  if (f.settlement_type === 'weekly_usd') { f.fee_cash_pct = null; f.spinup_pct = null; f.rakeback_pct = null }
  if (f.settlement_type === 'dinamico') { f.crypto_rebate_pct = null; f.rakeback_pct = null }
  if (f.taxa_tipo === 'fixa') { f.taxa_variavel_nome = null; f.taxa_variavel_indicador = null; f.taxa_variavel_regra = null }
  return f
}
export default function ClubesPage() {
  const [items, setItems] = useState<Club[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Club | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Club | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); try { const [c, l] = await Promise.all([getClubs(filter || undefined), getLeagues()]); setItems(c); setLeagues(l) } catch (e: any) { setError(e.message) } finally { setLoading(false) } }, [filter])
  useEffect(() => { load() }, [load])
  const handleSave = async (form: ClubForm) => { setSaving(true); setError(null); try { editing ? await updateClub(editing.id, clean(form)) : await createClub(clean(form)); await load(); setModalOpen(false); setEditing(null) } catch (e: any) { setError(e.message) } finally { setSaving(false) } }
  const handleDelete = async () => { if (!deleteTarget) return; setSaving(true); try { await deleteClub(deleteTarget.id); await load(); setDeleteTarget(null) } catch (e: any) { setError(e.message) } finally { setSaving(false) } }
  const settlementLabel: Record<string, string> = { dinamico: 'Taxa Dinâmica', weekly_usd: 'Weekly USD', rakeback: 'Rakeback' }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold text-white">Clubes</h1><p className="text-sm text-gray-400 mt-1">Entidade principal — regras financeiras por clube</p></div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors"><Plus size={16} />Novo Clube</button>
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
      <CadastroTable columns={[{key:'name',label:'Nome'},{key:'external_id',label:'ID App',render:(v:string)=>v??'—'},{key:'league',label:'Liga',render:(_:any,row:Club)=>row.league?.name??'—'},{key:'moeda',label:'Moeda'},{key:'settlement_type',label:'Modelo',render:(v:string)=>settlementLabel[v]??v??'—'},{key:'taxa_tipo',label:'Tipo Taxa',render:(v:string)=>v??'—'}]} data={items} loading={loading} onEdit={item => { setEditing(item); setModalOpen(true) }} onDelete={item => setDeleteTarget(item)} />
      <ClubModal open={modalOpen} editing={editing} leagues={leagues} onClose={() => { setModalOpen(false); setEditing(null) }} onSave={handleSave} saving={saving} />
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.name ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}

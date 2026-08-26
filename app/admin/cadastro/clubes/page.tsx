'use client'
import { useState, useEffect, useCallback } from 'react'
import { getClubs, createClub, updateClub, desativarClub, reativarClub, getLeagues, getPlataformas, initStoplossAtual } from '@/lib/cadastro-api'
import type { Club, ClubForm, League, Plataforma } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { ClubModal } from '@/components/cadastro/ClubModal'
import { BuscaSelect } from '@/components/BuscaSelect'
import { Plus, Filter, Search } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

function clean(form: ClubForm): ClubForm {
  const f = { ...form }
  if (f.settlement_type === 'rakeback') { f.fee_mtt_pct = null; f.fee_cash_pct = null; f.spinup_pct = null; f.taxa_variavel_nome = null; f.taxa_variavel_indicador = null; f.taxa_variavel_regra = null }
  if (f.settlement_type === 'weekly_usd') { f.fee_cash_pct = null; f.spinup_pct = null; f.rakeback_pct = null }
  if (f.settlement_type === 'taxa_dinamica') { f.rakeback_pct = null }
  if (f.taxa_tipo === 'fixa') { f.taxa_variavel_nome = null; f.taxa_variavel_indicador = null; f.taxa_variavel_regra = null }
  if (!f.rebate_ativo) f.rebate_pct = null
  if (!f.crypto_rebate_ativo) f.crypto_rebate_pct = null
  if (!f.moeda_conversao) f.cotacao = null
  return f
}

export default function ClubesPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<Club[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [plataformas, setPlataformas] = useState<Plataforma[]>([])
  const [filter, setFilter] = useState('')
  const [nomeFiltro, setNomeFiltro] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Club | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Club | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, l, p] = await Promise.all([getClubs(filter || undefined, mostrarInativos), getLeagues(), getPlataformas()])
      setItems(c); setLeagues(l); setPlataformas(p)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [filter, mostrarInativos])

  useEffect(() => { load() }, [load])

  const itemsFiltrados = nomeFiltro.trim()
    ? items.filter(i => i.name.toLowerCase().includes(nomeFiltro.trim().toLowerCase()))
    : items

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
    try { await desativarClub(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  // Clube ativo: abre confirmação antes de inativar. Clube já inativo: o
  // mesmo botão (agora com ícone de reativar) age direto, sem confirmar —
  // reverter é uma ação de baixo risco, não precisa do mesmo cuidado.
  const handleDeleteClick = async (item: Club) => {
    if (item.ativo) { setDeleteTarget(item); return }
    setError(null)
    try { await reativarClub(item.id); await load() }
    catch (e: any) { setError(e.message) }
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
        <div className="w-56">
          <BuscaSelect
            value={filter}
            onChange={setFilter}
            opcoes={leagues.map(l => ({ id: l.id, nome: l.name }))}
            vazio={t('clubes.todas_ligas')}
            className="bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50 w-full"
          />
        </div>
        <div className="relative w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={nomeFiltro}
            onChange={e => setNomeFiltro(e.target.value)}
            placeholder={t('common.buscar_por_nome')}
            className="w-full bg-surface2 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/50"
          />
        </div>
        <span className="text-sm text-gray-500">{t(itemsFiltrados.length === 1 ? 'clubes.clube_singular' : 'clubes.clube_plural', { n: itemsFiltrados.length })}</span>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer ml-auto">
          <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} className="accent-gold" />
          {t('clubes.mostrar_inativos')}
        </label>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'name', label: t('regra_modal.nome_label'), render: (v: string, row: Club) => (
            <span className="flex items-center gap-2">
              {v}
              {!row.ativo && <span className="px-1.5 py-0.5 rounded-full border border-white/10 text-gray-500 text-[10px] uppercase tracking-wider">{t('clubes.inativo_badge')}</span>}
            </span>
          ) },
          { key: 'external_id', label: t('clubes.col_id_app'), render: (v: string) => v ?? '—' },
          { key: 'leagues', label: t('regras_aplicadas.entidade_liga'), render: (_: any, row: Club) => row.leagues?.name ?? '—' },
          { key: 'moeda', label: t('league_modal.moeda_label') },
          { key: 'rebate_ativo', label: t('relatorio_taxas.col_rebate'), render: (v: boolean, row: Club) => v ? `${row.rebate_pct ?? 0}%` : '—' },
        ]}
        data={itemsFiltrados}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={handleDeleteClick}
        isInactive={(item: Club) => !item.ativo}
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
      <ConfirmDelete
        open={!!deleteTarget}
        name={deleteTarget?.name ?? ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        saving={saving}
        title={t('clubes.inativar_titulo')}
        confirmLabel={t('clubes.inativar_confirm')}
        description={t('clubes.inativar_desc', { nome: deleteTarget?.name ?? '' })}
      />
    </div>
  )
}
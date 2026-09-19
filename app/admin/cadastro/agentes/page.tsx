'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getAgentes, createAgente, updateAgente, deleteAgente, syncAgentePlataformas, syncClubeAgentes, syncSubAgentes, getPlataformas, getClubs } from '@/lib/cadastro-api'
import type { Agente, AgenteForm, AgentePlataforma, Plataforma, ClubeVinculado, Club } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { AgenteModal } from '@/components/cadastro/AgenteModal'
import { BuscaSelect } from '@/components/BuscaSelect'
import { Plus } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

// `useSearchParams` precisa ficar isolado e coberto por Suspense (mesmo
// padrão já usado em LancamentoView/RelatoriosView/etc — ver comentário em
// components/Sidebar.tsx) — sem isso tira a página inteira da renderização
// estática.
export default function AgentesPage() {
  return <Suspense fallback={null}><AgentesPageInner /></Suspense>
}

function AgentesPageInner() {
  const { t } = useI18n()
  // ?clube=<id> vem do link discreto no "Editar Clube" (ClubModal, pedido
  // do Cássio: "quero ver os SA e agentes aqui também") — abre essa tela já
  // filtrada pro clube de onde a pessoa veio, sem precisar achar e aplicar
  // o filtro na mão.
  const clubeDaUrl = useSearchParams().get('clube')
  const [items, setItems] = useState<Agente[]>([])
  const [plataformas, setPlataformas] = useState<Plataforma[]>([])
  const [clubes, setClubes] = useState<Club[]>([])
  const [clubeFiltro, setClubeFiltro] = useState(clubeDaUrl ?? '')
  const [saFiltro, setSaFiltro] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Agente | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agente | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, p, c] = await Promise.all([getAgentes(filter || undefined), getPlataformas(), getClubs()])
      setItems(a); setPlataformas(p); setClubes(c)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  // SA = agente que aparece como superagente_id de pelo menos um outro (mesma definição da tela de Super Agentes)
  const superAgentesOpcoes = items.filter(a => items.some(o => o.superagente_id === a.id))
  const itemsFiltrados = items
    .filter(a => !clubeFiltro || (a.clube_agentes ?? []).some(ca => ca.clube_id === clubeFiltro))
    .filter(a => !saFiltro || a.superagente_id === saFiltro)

  const vinculosIniciais = (item: Agente | null): AgentePlataforma[] =>
    item?.agente_plataformas?.map(v => ({
      id: v.id, agente_id: item.id, plataforma_id: v.plataforma_id, external_id: v.external_id, nickname: v.nickname,
    })) ?? []

  const clubesIniciais = (item: Agente | null): ClubeVinculado[] =>
    item?.clube_agentes?.map(ca => ({
      id: ca.clube_id,
      name: ca.clubs?.name ?? '—',
      external_id: ca.clubs?.external_id ?? null,
      plataforma_id: ca.clubs?.plataforma_id ?? null,
      leagueName: ca.clubs?.leagues?.name ?? null,
      rakeback_pct: ca.rakeback_pct ?? null,
    })) ?? []

  // Sub-agentes = outros registros de `items` que apontam pra este via superagente_id
  const subAgentesIniciais = (item: Agente | null): { id: string; nome: string; email: string | null }[] =>
    item ? items.filter(a => a.superagente_id === item.id).map(a => ({ id: a.id, nome: a.nome, email: a.email })) : []

  const handleSave = async (form: AgenteForm, vinculos: AgentePlataforma[], clubes: { id: string; rakeback_pct: number | null }[], subAgenteIds: string[]) => {
    setSaving(true); setError(null)
    try {
      let agenteId: string
      if (editing) {
        await updateAgente(editing.id, form)
        agenteId = editing.id
      } else {
        const created = await createAgente(form)
        agenteId = created.id
      }

      await syncAgentePlataformas(agenteId, vinculos, vinculosIniciais(editing))
      await syncClubeAgentes(agenteId, clubes, clubesIniciais(editing).map(c => c.id))
      await syncSubAgentes(agenteId, subAgenteIds, subAgentesIniciais(editing).map(a => a.id))

      await load(); setModalOpen(false); setEditing(null)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteAgente(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('agentes.titulo')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('agentes.subtitulo')}</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />{t('agentes.novo')}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text" value={filter} onChange={e => setFilter(e.target.value)}
          placeholder={t('common.buscar_por_nome')}
          className="bg-surface2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/50 w-64"
        />
        <div className="w-56">
          <BuscaSelect
            value={clubeFiltro}
            onChange={setClubeFiltro}
            opcoes={clubes.map(c => ({ id: c.id, nome: c.name }))}
            placeholder={t('agentes.filtro_clube')}
            vazio={t('agentes.todos_clubes')}
          />
        </div>
        <div className="w-56">
          <BuscaSelect
            value={saFiltro}
            onChange={setSaFiltro}
            opcoes={superAgentesOpcoes.map(a => ({ id: a.id, nome: a.nome }))}
            placeholder={t('agentes.filtro_sa')}
            vazio={t('agentes.todos_sa')}
          />
        </div>
        <span className="text-sm text-gray-500">{itemsFiltrados.length} agente{itemsFiltrados.length !== 1 ? 's' : ''}</span>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'nome', label: 'Nome' },
          { key: 'email', label: 'Email', render: (v: string) => v ?? '—' },
          {
            key: 'agente_plataformas', label: 'Plataformas',
            render: (v: Agente['agente_plataformas']) => v?.length ? v.map(p => p.plataformas?.nome).filter(Boolean).join(', ') : '—',
          },
          {
            key: 'clube_agentes', label: 'Clubes',
            render: (v: Agente['clube_agentes']) => v?.length ? `${v.length} clube${v.length !== 1 ? 's' : ''}` : '—',
          },
        ]}
        data={itemsFiltrados}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <AgenteModal
        open={modalOpen}
        editing={editing}
        vinculosIniciais={vinculosIniciais(editing)}
        clubesVinculadosIniciais={clubesIniciais(editing)}
        subAgentesIniciais={subAgentesIniciais(editing)}
        plataformas={plataformas}
        onClose={() => { setModalOpen(false); setEditing(null); setError(null) }}
        onSave={handleSave}
        saving={saving}
        error={error}
      />
      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.nome ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}
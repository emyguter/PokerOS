'use client'
import { useState, useEffect, useCallback } from 'react'
import { getJogadores, createJogador, updateJogador, deleteJogador, getPlataformas, getAgentes, getTodosAgenteJogadores, getClubs } from '@/lib/cadastro-api'
import type { Jogador, JogadorForm, Plataforma, Agente, Club } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { JogadorModal } from '@/components/cadastro/JogadorModal'
import { BuscaSelect } from '@/components/BuscaSelect'
import { Plus } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default function JogadoresPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<Jogador[]>([])
  const [plataformas, setPlataformas] = useState<Plataforma[]>([])
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [agenteJogadores, setAgenteJogadores] = useState<{ agente_id: string; jogador_id: string }[]>([])
  const [clubes, setClubes] = useState<Club[]>([])
  const [clubeFiltro, setClubeFiltro] = useState('')
  const [saFiltro, setSaFiltro] = useState('')
  const [agenteFiltro, setAgenteFiltro] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Jogador | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Jogador | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [j, p, a, aj, c] = await Promise.all([getJogadores(), getPlataformas(), getAgentes(), getTodosAgenteJogadores(), getClubs()])
      setItems(filter ? j.filter(x => x.nome.toLowerCase().includes(filter.toLowerCase())) : j)
      setPlataformas(p); setAgentes(a); setAgenteJogadores(aj); setClubes(c)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  // SA = agente que aparece como superagente_id de pelo menos um outro (mesma definição das telas de Agentes/Super Agentes)
  const superAgentesOpcoes = agentes.filter(a => agentes.some(o => o.superagente_id === a.id))
  const agentesPorId = new Map(agentes.map(a => [a.id, a]))
  // Agentes vinculados a cada jogador (join agente_jogadores) — usado pra
  // cruzar os filtros de Clube/SA/Agente, que vivem no cadastro do Agente,
  // não no do Jogador diretamente.
  const agenteIdsPorJogador = new Map<string, string[]>()
  for (const aj of agenteJogadores) {
    agenteIdsPorJogador.set(aj.jogador_id, [...(agenteIdsPorJogador.get(aj.jogador_id) ?? []), aj.agente_id])
  }
  const itemsFiltrados = items.filter(jogador => {
    const meusAgentes = (agenteIdsPorJogador.get(jogador.id) ?? []).map(id => agentesPorId.get(id)).filter((a): a is Agente => !!a)
    if (clubeFiltro && !meusAgentes.some(a => (a.clube_agentes ?? []).some(ca => ca.clube_id === clubeFiltro))) return false
    if (saFiltro && !meusAgentes.some(a => a.superagente_id === saFiltro)) return false
    if (agenteFiltro && !meusAgentes.some(a => a.id === agenteFiltro)) return false
    return true
  })

  const handleSave = async (form: JogadorForm) => {
    setSaving(true); setError(null)
    try {
      if (editing) await updateJogador(editing.id, form)
      else await createJogador(form)
      await load(); setModalOpen(false); setEditing(null)
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try { await deleteJogador(deleteTarget.id); await load(); setDeleteTarget(null) }
    catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('jogadores.titulo')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('jogadores.subtitulo')}</p>
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />{t('jogadores.novo')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
            placeholder={t('jogadores.filtro_clube')}
            vazio={t('jogadores.todos_clubes')}
          />
        </div>
        <div className="w-56">
          <BuscaSelect
            value={saFiltro}
            onChange={setSaFiltro}
            opcoes={superAgentesOpcoes.map(a => ({ id: a.id, nome: a.nome }))}
            placeholder={t('jogadores.filtro_sa')}
            vazio={t('jogadores.todos_sa')}
          />
        </div>
        <div className="w-56">
          <BuscaSelect
            value={agenteFiltro}
            onChange={setAgenteFiltro}
            opcoes={agentes.map(a => ({ id: a.id, nome: a.nome }))}
            placeholder={t('jogadores.filtro_agente')}
            vazio={t('jogadores.todos_agentes')}
          />
        </div>
        <span className="text-sm text-gray-500">{itemsFiltrados.length} jogador{itemsFiltrados.length !== 1 ? 'es' : ''}</span>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <CadastroTable
        columns={[
          { key: 'nome', label: 'Nome' },
          { key: 'external_id', label: 'ID', render: (v: string) => v ?? '—' },
          { key: 'plataformas', label: 'Plataforma', render: (_: any, row: Jogador) => row.plataformas?.nome ?? '—' },
          { key: 'telefone', label: 'Telefone', render: (v: string) => v ?? '—' },
        ]}
        data={itemsFiltrados}
        loading={loading}
        onEdit={item => { setEditing(item); setModalOpen(true) }}
        onDelete={item => setDeleteTarget(item)}
      />

      <JogadorModal
        open={modalOpen}
        editing={editing}
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
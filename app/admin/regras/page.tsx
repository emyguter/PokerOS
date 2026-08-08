'use client'
import { useState, useEffect, useCallback } from 'react'
import { getRegras, createRegra, updateRegra, deleteRegra } from '@/lib/cadastro-api'
import { supabase } from '@/lib/supabase'
import { formatIndicadorNome } from '@/lib/indicadores'
import type { Regra, RegraForm } from '@/lib/types'
import { CadastroTable } from '@/components/cadastro/CadastroTable'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { RegraModal } from '@/components/cadastro/RegraModal'
import { VinculosPanel } from '@/components/cadastro/VinculosPanel'
import { Plus, Link2 } from 'lucide-react'

interface IndicadorInfo { nome: string; descricao: string | null }

// Frase em linguagem simples do que a regra faz — em vez de só "3 faixas",
// pra quem não é técnico entender sem abrir o formulário.
function resumoRegra(r: Regra, indicadores: Map<string, IndicadorInfo>): string {
  if (r.tipo === 'cotacao') {
    return `1 ${r.moeda_origem ?? '?'} = ${r.valor_cotacao ?? '?'} ${r.moeda_destino ?? '?'}`
  }
  if (r.condicoes.length === 0) return 'Sem condições ainda'
  return r.condicoes.map(c => {
    if (c.is_fallback) return `SENÃO → ${c.resultado_pct ?? '?'}%`
    const termos = c.indicador_ids
      .filter(Boolean)
      .map(id => { const ind = indicadores.get(id); return ind ? formatIndicadorNome(ind.nome, ind.descricao) : '?' })
      .join(' + ')
    return `SE ${termos || '?'} ${c.operador} ${c.valor ?? '?'} → ${c.resultado_pct ?? '?'}%`
  }).join(', ')
}

export default function RegrasPage() {
  const [items, setItems] = useState<Regra[]>([])
  const [indicadores, setIndicadores] = useState<Map<string, IndicadorInfo>>(new Map())
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

  useEffect(() => {
    supabase.from('indicadores').select('id, nome, descricao').then(({ data }) => {
      setIndicadores(new Map((data ?? []).map(i => [i.id as string, { nome: i.nome as string, descricao: i.descricao as string | null }])))
    })
  }, [])

  async function handleSave(form: RegraForm) {
    setSaving(true); setError(null)
    try {
      if (editing) {
        await updateRegra(editing.id, form)
        await load()
      } else {
        // Regra nova não serve pra nada até ser vinculada a alguém — em vez
        // de fechar e deixar órfã, já abre o painel de vínculo na sequência.
        const novoId = await createRegra(form)
        const lista = await getRegras()
        setItems(lista)
        const nova = lista.find(r => r.id === novoId)
        if (nova) setVinculosRegra(nova)
      }
      setModalOpen(false); setEditing(null)
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
          {
            key: 'tipo',
            label: 'O que faz',
            render: (_: string, row: Regra) => (
              <span className="text-xs text-gray-300">{resumoRegra(row, indicadores)}</span>
            ),
          },
          {
            key: 'vinculoCount',
            label: 'Vínculos',
            render: (v: number, row: Regra) => (
              <button onClick={() => setVinculosRegra(row)} className={`flex items-center gap-1.5 text-sm transition-colors ${v === 0 ? 'text-gold hover:underline' : 'text-gray-300 hover:text-gold'}`}>
                <Link2 size={13} />{v === 0 ? 'Vincular agora' : v}
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
        resumo={vinculosRegra ? resumoRegra(vinculosRegra, indicadores) : undefined}
        onClose={() => { setVinculosRegra(null); load() }}
      />

      <ConfirmDelete open={!!deleteTarget} name={deleteTarget?.nome ?? ''} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} saving={saving} />
    </div>
  )
}

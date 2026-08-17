'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import {
  getDividas, getParcelas, criarDivida, marcarParcelaPaga, atualizarStatusDivida, excluirDivida, getFaixasMultaDoClube,
  diasDeAtraso, valorComMulta, percentualMulta,
  type DividaRow, type DividaForm, type ParcelaRow, type FaixaMulta,
} from '@/lib/dividas'
import { DividaModal } from './DividaModal'

interface ClubeOpcao { id: string; name: string }

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUS_LABEL: Record<DividaRow['status'], string> = { ativo: 'Ativo', quitado: 'Quitado', cancelado: 'Cancelado' }
const STATUS_COR: Record<DividaRow['status'], string> = { ativo: 'text-gold', quitado: 'text-success', cancelado: 'text-gray-500' }

export function DividasView() {
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [dividas, setDividas] = useState<DividaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionada, setSelecionada] = useState<DividaRow | null>(null)
  const [parcelas, setParcelas] = useState<ParcelaRow[]>([])
  const [faixasMulta, setFaixasMulta] = useState<FaixaMulta[]>([])
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<DividaRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setDividas(await getDividas())
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes(data ?? []))
    load()
  }, [load])

  async function abrirDetalhe(d: DividaRow) {
    setSelecionada(d)
    setLoadingDetalhe(true)
    const [ps, faixas] = await Promise.all([
      d.tipo === 'acordo' ? getParcelas(d.id) : Promise.resolve([]),
      getFaixasMultaDoClube(d.clube_id),
    ])
    setParcelas(ps)
    setFaixasMulta(faixas)
    setLoadingDetalhe(false)
  }

  async function handleSave(form: DividaForm) {
    setSaving(true); setError(null)
    try {
      await criarDivida(form)
      await load()
      setModalOpen(false)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleMarcarPaga(parcela: ParcelaRow) {
    if (!selecionada) return
    const diasAtraso = diasDeAtraso(parcela.vencimento)
    const valor = diasAtraso > 0 ? valorComMulta(parcela.valor, diasAtraso, faixasMulta) : parcela.valor
    await marcarParcelaPaga(parcela.id, valor)
    await abrirDetalhe(selecionada)
    const todas = await getParcelas(selecionada.id)
    if (todas.every((p) => p.pago)) await atualizarStatusDivida(selecionada.id, 'quitado')
    await load()
  }

  async function handleMarcarSimplesQuitada() {
    if (!selecionada) return
    await atualizarStatusDivida(selecionada.id, 'quitado')
    await load()
    setSelecionada((s) => (s ? { ...s, status: 'quitado' } : s))
  }

  async function handleExcluir() {
    if (!excluindo) return
    setSaving(true)
    try {
      await excluirDivida(excluindo.id)
      if (selecionada?.id === excluindo.id) setSelecionada(null)
      setExcluindo(null)
      await load()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dívidas e Acordos</h1>
          <p className="text-sm text-gray-400 mt-1">Clubes com dívida simples ou Acordo parcelado, com juros e multa por atraso</p>
        </div>
        <button onClick={() => { setError(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />Nova Dívida
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
        <div className="rounded-xl border border-white/10 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Carregando...</div>
          ) : dividas.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">Nenhuma dívida cadastrada ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-surface2">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Clube</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tipo</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Valor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dividas.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => abrirDetalhe(d)}
                      className={`border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.03] ${selecionada?.id === d.id ? 'bg-gold/5' : ''}`}
                    >
                      <td className="px-4 py-3 text-white">{d.clube_nome}</td>
                      <td className="px-4 py-3 text-gray-300">{d.tipo === 'acordo' ? 'Acordo' : 'Simples'}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{fmt(d.valor_integral)}</td>
                      <td className={`px-4 py-3 font-medium ${STATUS_COR[d.status]}`}>{STATUS_LABEL[d.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 p-4">
          {!selecionada ? (
            <p className="text-sm text-gray-500 text-center py-8">Selecione uma dívida pra ver os detalhes.</p>
          ) : loadingDetalhe ? (
            <p className="text-sm text-gray-500 text-center py-8">Carregando...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-medium">{selecionada.clube_nome}</p>
                  <p className="text-xs text-gray-500">{selecionada.descricao || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${STATUS_COR[selecionada.status]}`}>{STATUS_LABEL[selecionada.status]}</span>
                  <button onClick={() => setExcluindo(selecionada)} title="Excluir" className="p-1.5 rounded-lg text-gray-400 hover:text-alert hover:bg-alert/10 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>

              {selecionada.tipo === 'simples' ? (
                <div className="rounded-lg border border-white/10 bg-surface2 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Valor</p>
                    <p className="text-lg font-semibold text-white">{fmt(selecionada.valor_integral)}</p>
                  </div>
                  {selecionada.status === 'ativo' && (
                    <button onClick={handleMarcarSimplesQuitada} className="flex items-center gap-1.5 px-3 py-2 bg-success/10 border border-success/30 text-success rounded-lg text-sm font-medium hover:bg-success/20 transition-colors">
                      <CheckCircle2 size={14} />Marcar como quitada
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {faixasMulta.length === 0 && (
                    <p className="text-xs text-gray-500 italic">Esse clube não tem Regra de Multa de Acerto vinculada — parcelas atrasadas não recebem multa.</p>
                  )}
                  {parcelas.map((p) => {
                    const atraso = !p.pago ? diasDeAtraso(p.vencimento) : 0
                    const pct = atraso > 0 ? percentualMulta(atraso, faixasMulta) : 0
                    const valorComPenalidade = atraso > 0 ? valorComMulta(p.valor, atraso, faixasMulta) : p.valor
                    return (
                      <div key={p.id} className={`rounded-lg border p-3 flex items-center justify-between ${p.pago ? 'border-white/10 bg-surface2' : atraso > 0 ? 'border-alert/30 bg-alert/5' : 'border-white/10 bg-surface2'}`}>
                        <div>
                          <p className="text-sm text-white">Parcela {p.numero} <span className="text-gray-500">— vence {new Date(p.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></p>
                          {p.pago ? (
                            <p className="text-xs text-success flex items-center gap-1 mt-0.5"><CheckCircle2 size={12} />Pago: {fmt(p.valor_pago ?? p.valor)}</p>
                          ) : atraso > 0 ? (
                            <p className="text-xs text-alert flex items-center gap-1 mt-0.5"><AlertTriangle size={12} />{atraso} dia(s) de atraso{pct > 0 ? ` · +${pct}% de multa` : ''} — {fmt(valorComPenalidade)}</p>
                          ) : (
                            <p className="text-xs text-gray-500 mt-0.5">Em aberto — {fmt(p.valor)}</p>
                          )}
                        </div>
                        {!p.pago && (
                          <button onClick={() => handleMarcarPaga(p)} className="px-3 py-1.5 bg-gold text-surface rounded-lg text-xs font-semibold hover:bg-gold/90 transition-colors">
                            Marcar como paga
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DividaModal open={modalOpen} clubes={clubes} onClose={() => setModalOpen(false)} onSave={handleSave} saving={saving} error={error} />
      <ConfirmDelete
        open={!!excluindo}
        name={excluindo?.clube_nome ?? ''}
        onConfirm={handleExcluir}
        onCancel={() => setExcluindo(null)}
        saving={saving}
        title="Excluir dívida"
        description={<>Tem certeza que deseja excluir a dívida de <span className="text-white font-medium">{excluindo?.clube_nome}</span>? Isso apaga também todas as parcelas. Essa ação não pode ser desfeita.</>}
      />
    </div>
  )
}

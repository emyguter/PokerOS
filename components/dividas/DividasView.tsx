'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, CheckCircle2, AlertTriangle, Trash2, Pencil, Split } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { useI18n } from '@/lib/i18n'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import {
  getDividas, getParcelas, criarDivida, atualizarDivida, podeEditarTermosDivida, interromperEcriarFilho,
  atualizarStatusDivida, excluirDivida, getFaixasMultaDoClube,
  diasDeAtraso, valorComMulta, percentualMulta,
  type DividaRow, type DividaForm, type ParcelaRow, type FaixaMulta,
} from '@/lib/dividas'
import { DividaModal } from './DividaModal'
import { InterromperAcordoModal } from './InterromperAcordoModal'

interface ClubeOpcao { id: string; name: string }

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

const STATUS_COR: Record<DividaRow['status'], string> = { ativo: 'text-gold', quitado: 'text-success', cancelado: 'text-gray-500', interrompido: 'text-alert' }

export function DividasView() {
  const { t } = useI18n()
  const STATUS_LABEL: Record<DividaRow['status'], string> = {
    ativo: t('dividas_view.status.ativo'), quitado: t('dividas_view.status.quitado'),
    cancelado: t('dividas_view.status.cancelado'), interrompido: t('dividas_view.status.interrompido'),
  }
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [dividas, setDividas] = useState<DividaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionada, setSelecionada] = useState<DividaRow | null>(null)
  const [parcelas, setParcelas] = useState<ParcelaRow[]>([])
  const [faixasMulta, setFaixasMulta] = useState<FaixaMulta[]>([])
  const [podeEditarTermos, setPodeEditarTermos] = useState(true)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<DividaRow | null>(null)
  const [interromperAberto, setInterromperAberto] = useState(false)
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
    const [ps, faixas, podeTermos] = await Promise.all([
      d.tipo === 'acordo' ? getParcelas(d.id) : Promise.resolve([]),
      getFaixasMultaDoClube(d.clube_id),
      podeEditarTermosDivida(d.id),
    ])
    setParcelas(ps)
    setFaixasMulta(faixas)
    setPodeEditarTermos(podeTermos)
    setLoadingDetalhe(false)
  }

  async function handleSave(form: DividaForm) {
    setSaving(true); setError(null)
    try {
      if (editando) await atualizarDivida(editando.id, form)
      else await criarDivida(form)
      await load()
      setModalOpen(false)
      setEditando(null)
      if (selecionada) {
        const atualizada = (await getDividas()).find((d) => d.id === selecionada.id)
        if (atualizada) await abrirDetalhe(atualizada)
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleInterromper(novoTermos: Omit<DividaForm, 'clube_id' | 'valor_integral' | 'tipo'>) {
    if (!selecionada) return
    setSaving(true); setError(null)
    try {
      await interromperEcriarFilho(selecionada.id, novoTermos)
      await load()
      setInterromperAberto(false)
      setSelecionada(null)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
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

  // Modo Pagar com Rake sem cronograma: nasceu sem parcela nenhuma (quita
  // tudo de uma vez no próximo Acerto — ver lib/dividas.ts).
  const semCronograma = selecionada?.tipo === 'acordo' && selecionada.quantidade_parcelas == null
  const saldoRestante = selecionada
    ? (selecionada.tipo === 'simples' || semCronograma
        ? selecionada.valor_integral
        : parcelas.filter((p) => !p.pago).reduce((s, p) => s + p.valor, 0))
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('dividas_view.titulo')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('dividas_view.subtitulo')}</p>
        </div>
        <button onClick={() => { setError(null); setEditando(null); setModalOpen(true) }} className="flex items-center gap-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          <Plus size={16} />{t('dividas_view.nova')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
        <div className="rounded-xl border border-white/10 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
          ) : dividas.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">{t('dividas_view.nenhuma')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-surface2">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('dividas_view.col_clube')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('dividas_view.col_tipo')}</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('dividas_view.col_valor')}</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('dividas_view.col_status')}</th>
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
                      <td className="px-4 py-3 text-gray-300">{d.tipo === 'acordo' ? t('dividas_view.tipo_acordo') : t('dividas_view.tipo_simples')}</td>
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
            <p className="text-sm text-gray-500 text-center py-8">{t('dividas_view.selecione_detalhe')}</p>
          ) : loadingDetalhe ? (
            <p className="text-sm text-gray-500 text-center py-8">{t('common.carregando')}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-medium">{selecionada.clube_nome}</p>
                  <p className="text-xs text-gray-500">{selecionada.descricao || '—'}</p>
                  {selecionada.divida_pai_id && <p className="text-xs text-gray-600 mt-0.5">{t('dividas_view.acordo_filho')}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${STATUS_COR[selecionada.status]}`}>{STATUS_LABEL[selecionada.status]}</span>
                  <button onClick={() => { setEditando(selecionada); setError(null); setModalOpen(true) }} title={t('dividas_view.editar_title')} className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"><Pencil size={14} /></button>
                  {selecionada.tipo === 'acordo' && selecionada.status === 'ativo' && (
                    <button onClick={() => { setError(null); setInterromperAberto(true) }} title={t('dividas_view.interromper_title')} className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors"><Split size={14} /></button>
                  )}
                  <button onClick={() => setExcluindo(selecionada)} title={t('dividas_view.excluir_title')} className="p-1.5 rounded-lg text-gray-400 hover:text-alert hover:bg-alert/10 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>

              {selecionada.tipo === 'simples' ? (
                <div className="rounded-lg border border-white/10 bg-surface2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">{selecionada.rakeback_pct != null ? t('dividas_view.saldo_restante') : t('dividas_view.valor')}</p>
                      <p className="text-lg font-semibold text-white">{fmt(selecionada.rakeback_pct != null ? selecionada.saldo_restante ?? selecionada.valor_integral : selecionada.valor_integral)}</p>
                      {selecionada.rakeback_pct != null && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t('dividas_view.de_valor_pct', { valor: fmt(selecionada.valor_integral), pct: selecionada.rakeback_pct })}
                          {selecionada.pagamento_minimo ? t('dividas_view.minimo_abater', { valor: fmt(selecionada.pagamento_minimo) }) : ''}
                        </p>
                      )}
                    </div>
                    {selecionada.status === 'ativo' && (
                      <button onClick={handleMarcarSimplesQuitada} className="flex items-center gap-1.5 px-3 py-2 bg-success/10 border border-success/30 text-success rounded-lg text-sm font-medium hover:bg-success/20 transition-colors">
                        <CheckCircle2 size={14} />{t('dividas_view.marcar_quitada')}
                      </button>
                    )}
                  </div>
                  {/* Pagar com Rake só se decide na criação, igual Acordo
                      (pedido do Cássio) — aqui é só leitura; pra mudar, edita
                      a Dívida (Pencil) e muda lá, ou recria. */}
                  <p className="text-xs text-gray-500">{t('dividas_view.pagar_com_rake')}: {selecionada.pago_com_rake ? t('dividas_view.pagar_com_rake_sim') : t('dividas_view.pagar_com_rake_nao')}</p>
                </div>
              ) : semCronograma ? (
                <div className="rounded-lg border border-white/10 bg-surface2 p-4 space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">{t('dividas_view.divida_inicial')}</p>
                    <p className="text-lg font-semibold text-white">{fmt(selecionada.valor_integral)}</p>
                  </div>
                  {selecionada.status === 'quitado' && selecionada.quitado_em ? (
                    <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={12} />{t('dividas_view.pago_em', { data: fmtData(selecionada.quitado_em), valor: fmt(selecionada.valor_integral) })}</p>
                  ) : (
                    <p className="text-xs text-gray-500">{t('dividas_view.em_aberto_sem_multa', { valor: fmt(saldoRestante) })}</p>
                  )}
                  {/* Pagar com Rake de Acordo só se decide na criação (pedido
                      do Cássio: "eu não altero Acordo") — aqui é só leitura;
                      pra mudar, Interromper e criar um Acordo filho. */}
                  <p className="text-xs text-gray-500">{t('dividas_view.pagar_com_rake')}: {selecionada.pago_com_rake ? t('dividas_view.pagar_com_rake_sim') : t('dividas_view.pagar_com_rake_nao')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">{t('dividas_view.pagar_com_rake')}: {selecionada.pago_com_rake ? t('dividas_view.pagar_com_rake_sim') : t('dividas_view.pagar_com_rake_nao')}</p>
                  {faixasMulta.length === 0 && (
                    <p className="text-xs text-gray-500 italic">{t('dividas_view.sem_regra_multa')}</p>
                  )}
                  {parcelas.map((p) => {
                    const atraso = !p.pago ? diasDeAtraso(p.vencimento) : 0
                    const pct = atraso > 0 ? percentualMulta(atraso, faixasMulta) : 0
                    const valorComPenalidade = atraso > 0 ? valorComMulta(p.valor, atraso, faixasMulta) : p.valor
                    return (
                      <div key={p.id} className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${p.pago ? 'border-white/10 bg-surface2' : atraso > 0 ? 'border-alert/30 bg-alert/5' : 'border-white/10 bg-surface2'}`}>
                        <div>
                          <p className="text-sm text-white">{t('dividas_view.parcela_vence', { n: p.numero, data: new Date(p.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') })}</p>
                          {p.pago ? (
                            <p className="text-xs text-success flex items-center gap-1 mt-0.5"><CheckCircle2 size={12} />{t('dividas_view.pago_valor', { valor: fmt(p.valor_pago ?? p.valor) })}</p>
                          ) : atraso > 0 ? (
                            <p className="text-xs text-alert flex items-center gap-1 mt-0.5"><AlertTriangle size={12} />{t('dividas_view.atraso', { n: atraso })}{pct > 0 ? t('dividas_view.multa_pct', { pct }) : ''} — {fmt(valorComPenalidade)}</p>
                          ) : (
                            <p className="text-xs text-gray-500 mt-0.5">{t('dividas_view.em_aberto', { valor: fmt(p.valor) })}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DividaModal
        open={modalOpen}
        clubes={clubes}
        editing={editando}
        podeEditarTermos={podeEditarTermos}
        onClose={() => { setModalOpen(false); setEditando(null) }}
        onSave={handleSave}
        saving={saving}
        error={error}
      />
      <InterromperAcordoModal
        open={interromperAberto}
        divida={selecionada}
        saldoRestante={saldoRestante}
        onClose={() => setInterromperAberto(false)}
        onSave={handleInterromper}
        saving={saving}
        error={error}
      />
      <ConfirmDelete
        open={!!excluindo}
        name={excluindo?.clube_nome ?? ''}
        onConfirm={handleExcluir}
        onCancel={() => setExcluindo(null)}
        saving={saving}
        title={t('dividas_view.excluir_titulo')}
        description={<>{t('dividas_view.excluir_desc_pre')} <span className="text-white font-medium">{excluindo?.clube_nome}</span>{t('dividas_view.excluir_desc_pos')}</>}
      />
    </div>
  )
}

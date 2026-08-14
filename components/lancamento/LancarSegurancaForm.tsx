'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { desvincularConciliacao } from '@/lib/lancamentos'
import { BuscaSelect } from '@/components/BuscaSelect'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { CATEGORIAS_SEGURANCA } from './ExtratoView'
import { EditarLancamentoModal } from './EditarLancamentoModal'

interface ClubeOpcao { id: string; name: string }

interface LancamentoRecente {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  categoria_seguranca: string | null
  clubs: { name: string } | null
}

type Acao = 'bloqueio' | 'reembolso'

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

// Bloqueio (débito, quando o clube fez algo ilegal) e Reembolso (crédito,
// quando o clube sofreu um golpe) são as duas únicas ações — natureza e
// tipo andam sempre juntos aqui, pra não deixar registrar um bloqueio como
// crédito por engano. A categoria do incidente (Bot, Collusion...) é só
// referência interna do time de Segurança.
export function LancarSegurancaForm() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState('')
  const [acao, setAcao] = useState<Acao>('bloqueio')
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_SEGURANCA[0].value)
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState(hoje())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recentes, setRecentes] = useState<LancamentoRecente[]>([])
  const [loadingRecentes, setLoadingRecentes] = useState(true)
  const [editando, setEditando] = useState<LancamentoRecente | null>(null)
  const [excluindo, setExcluindo] = useState<LancamentoRecente | null>(null)
  const [deletando, setDeletando] = useState(false)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)
  const [precisaForcar, setPrecisaForcar] = useState(false)

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes(data ?? []))
  }, [])

  const loadRecentes = useCallback(async () => {
    setLoadingRecentes(true)
    const { data } = await supabase
      .from('lancamentos')
      .select('id, tipo, natureza, valor, descricao, data_lancamento, categoria_seguranca, clubs(name)')
      .eq('origem', 'seguranca')
      .order('created_at', { ascending: false })
      .limit(10)
    setRecentes((data ?? []) as unknown as LancamentoRecente[])
    setLoadingRecentes(false)
  }, [])

  useEffect(() => { loadRecentes() }, [loadRecentes])

  async function handleExcluir() {
    if (!excluindo) return
    setDeletando(true); setErroExclusao(null)
    try {
      if (precisaForcar) await desvincularConciliacao(excluindo.id)
      const { error: delErr } = await supabase.from('lancamentos').delete().eq('id', excluindo.id)
      if (delErr) {
        if ((delErr as { code?: string }).code === '23503' && !precisaForcar) {
          setErroExclusao(t('lancamento.excluir_bloqueado_conciliacao', { botao: t('lancamento.excluir_forcar') }))
          setPrecisaForcar(true)
          return
        }
        throw delErr
      }
      setExcluindo(null); setPrecisaForcar(false)
      await loadRecentes()
    } catch (err) {
      setErroExclusao(errMsg(err))
    } finally {
      setDeletando(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clubeId) { setError('Escolha o clube.'); return }
    const valorNum = Number(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) { setError('Informe um valor válido.'); return }
    setSaving(true); setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error: insErr } = await supabase.from('lancamentos').insert({
        clube_id: clubeId,
        tipo: acao === 'bloqueio' ? 'seguranca_bloqueio' : 'seguranca_reembolso',
        natureza: acao === 'bloqueio' ? 'debito' : 'credito',
        categoria_seguranca: categoria,
        valor: valorNum,
        descricao: descricao || null,
        data_lancamento: data,
        criado_por: userData.user?.id ?? null,
        origem: 'seguranca',
      })
      if (insErr) throw insErr
      setValor('')
      setDescricao('')
      setData(hoje())
      await loadRecentes()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-surface2 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.clube')}</label>
            <BuscaSelect
              value={clubeId}
              onChange={setClubeId}
              opcoes={clubes.map(c => ({ id: c.id, nome: c.name }))}
              placeholder={t('common.selecione')}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('seguranca.categoria')}</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
              {CATEGORIAS_SEGURANCA.map((c) => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('seguranca.acao')}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAcao('bloqueio')}
              className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${acao === 'bloqueio' ? 'border-alert/50 bg-alert/10 text-alert' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
            >
              {t('seguranca.bloqueio')}
            </button>
            <button
              type="button"
              onClick={() => setAcao('reembolso')}
              className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${acao === 'reembolso' ? 'border-success/50 bg-success/10 text-success' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
            >
              {t('seguranca.reembolso')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.valor')}</label>
            <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.data')}</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.descricao')}</label>
          <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={t('seguranca.descricao_placeholder')} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>

        {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('lancamento.lancar')}
          </button>
        </div>
      </form>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('lancamento.ultimos_lancamentos')}</p>
        <div className="rounded-xl border border-white/10 overflow-hidden">
          {loadingRecentes ? (
            <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
          ) : recentes.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">{t('lancamento.nenhum_lancamento')}</div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentes.map((l) => (
                <div key={l.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-white">
                      {l.clubs?.name ?? '—'} <span className="text-gray-500">· {l.natureza === 'debito' ? t('seguranca.bloqueio') : t('seguranca.reembolso')}</span>
                      {l.categoria_seguranca && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full border border-white/10 text-gray-400">
                          {t(CATEGORIAS_SEGURANCA.find((c) => c.value === l.categoria_seguranca)?.labelKey ?? l.categoria_seguranca)}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">{new Date(l.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}{l.descricao ? ` · ${l.descricao}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${l.natureza === 'credito' ? 'text-success' : 'text-alert'}`}>
                      {l.natureza === 'credito' ? '+' : '−'}{formatMoeda(l.valor)}
                    </span>
                    <button onClick={() => setEditando(l)} title={t('common.editar')} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => { setExcluindo(l); setErroExclusao(null); setPrecisaForcar(false) }} title={t('common.deletar')} className="p-1.5 rounded-lg text-gray-400 hover:text-alert hover:bg-alert/10 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <EditarLancamentoModal
        open={!!editando}
        lancamento={editando}
        onClose={() => setEditando(null)}
        onSaved={() => { setEditando(null); loadRecentes() }}
      />
      <ConfirmDelete
        open={!!excluindo}
        name={excluindo ? `${excluindo.natureza === 'debito' ? t('seguranca.bloqueio') : t('seguranca.reembolso')} · ${formatMoeda(excluindo.valor)}` : ''}
        onConfirm={handleExcluir}
        onCancel={() => { setExcluindo(null); setErroExclusao(null); setPrecisaForcar(false) }}
        saving={deletando}
        error={erroExclusao}
        title={t('lancamento.excluir_titulo')}
        description={t('lancamento.excluir_desc')}
        confirmLabel={precisaForcar ? t('lancamento.excluir_forcar') : undefined}
      />
    </div>
  )
}

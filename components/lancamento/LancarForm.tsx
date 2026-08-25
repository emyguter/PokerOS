'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { desvincularConciliacao } from '@/lib/lancamentos'
import { corrigirValorCrypto } from '@/lib/relatorio-acerto'
import { BuscaSelect } from '@/components/BuscaSelect'
import { ConfirmDelete } from '@/components/cadastro/ConfirmDelete'
import { TIPOS, ehTipoSeguranca } from './ExtratoView'

// Esse form só cria lançamento com origem 'suporte'/'genia' — Bloqueio/
// Reembolso da Segurança (origem 'seguranca') não podem aparecer aqui, senão
// dá pra criar um lançamento com tipo de Segurança na origem errada.
const TIPOS_FORM = TIPOS.filter((tp) => !ehTipoSeguranca(tp.value))
import { EditarLancamentoModal } from './EditarLancamentoModal'

interface ClubeOpcao { id: string; name: string }

interface LancamentoRecente {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  status: string | null
  clube_id: string
  acerto_id: string | null
  clubs: { name: string } | null
}

interface AcertoOpcao {
  id: string
  valor_acerto: number
  period_start: string | null
  period_end: string | null
}

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function formatPeriodoAcerto(a: AcertoOpcao) {
  if (!a.period_start) return formatMoeda(a.valor_acerto)
  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const periodo = a.period_end ? `${fmtD(a.period_start)}–${fmtD(a.period_end)}` : fmtD(a.period_start)
  return `${periodo} · R$ ${formatMoeda(a.valor_acerto)}`
}

export function LancarForm({ origem = 'suporte', onCreated }: { origem?: 'suporte' | 'genia'; onCreated?: () => void }) {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState('')
  const [tipo, setTipo] = useState<string>(TIPOS_FORM[0].value)
  const [natureza, setNatureza] = useState<'credito' | 'debito'>('credito')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState(hoje())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [recentes, setRecentes] = useState<LancamentoRecente[]>([])
  const [loadingRecentes, setLoadingRecentes] = useState(true)
  const [confirmandoDuplicata, setConfirmandoDuplicata] = useState(false)
  const [editando, setEditando] = useState<LancamentoRecente | null>(null)
  const [excluindo, setExcluindo] = useState<LancamentoRecente | null>(null)
  const [deletando, setDeletando] = useState(false)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)
  const [precisaForcar, setPrecisaForcar] = useState(false)

  const [acertosClube, setAcertosClube] = useState<AcertoOpcao[]>([])
  const [acertoId, setAcertoId] = useState('')
  const [clubeCryptoPct, setClubeCryptoPct] = useState(0)
  const [pagoCrypto, setPagoCrypto] = useState(false)

  useEffect(() => {
    supabase.from('clubs').select('id, name').order('name').then(({ data }) => setClubes(data ?? []))
  }, [])

  // Pagamento sempre precisa apontar pra um Acerto — quita uma Diferença
  // específica e alimenta o Controle de Pagamentos/Cobrança (ver
  // lib/pagamentos.ts, buscarPagamentosPorImport busca por acerto_id).
  // Antecipação NÃO paga Acerto nenhum — ela só aumenta o Stoploss vigente
  // do clube quando concilia com a Genia (registrarAntecipacaoNoStoploss em
  // useConciliacao.ts), independente de ter Acerto pendente ou não. Por isso
  // o campo de Acerto continua aparecendo pra Antecipação (útil se quiser
  // rastrear no Controle de Pagamentos mesmo assim), mas não é obrigatório.
  // Aproveita a troca de clube pra já buscar o % de Crypto Rebate junto
  // (usado só pelo botão "Pagar com Crypto", Tipo Pagamento) — corrige o
  // Valor pra já vir descontado, mesma fórmula do "Total Crypto Rebate" em
  // Acertos (valor ÷ (1 + %)).
  const ehPagamentoComAcerto = tipo === 'pagamento' || tipo === 'antecipacao'
  const acertoObrigatorio = tipo === 'pagamento'
  useEffect(() => {
    if (!clubeId) { setClubeCryptoPct(0) }
    else {
      supabase.from('clubs').select('crypto_rebate_pct').eq('id', clubeId).single()
        .then(({ data }) => setClubeCryptoPct(data?.crypto_rebate_pct ?? 0))
    }
    if (!ehPagamentoComAcerto || !clubeId) { setAcertosClube([]); setAcertoId(''); return }
    supabase
      .from('acertos')
      .select('id, valor_acerto, imports(period_start, period_end)')
      .eq('club_id', clubeId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const lista = ((data ?? []) as unknown as { id: string; valor_acerto: number; imports: { period_start: string | null; period_end: string | null } | null }[])
          .map((a) => ({ id: a.id, valor_acerto: a.valor_acerto, period_start: a.imports?.period_start ?? null, period_end: a.imports?.period_end ?? null }))
        setAcertosClube(lista)
        setAcertoId('')
      })
  }, [ehPagamentoComAcerto, clubeId])

  const loadRecentes = useCallback(async () => {
    setLoadingRecentes(true)
    const { data } = await supabase
      .from('lancamentos')
      .select('id, tipo, natureza, valor, descricao, data_lancamento, status, clube_id, acerto_id, clubs(name)')
      .eq('origem', origem)
      .order('created_at', { ascending: false })
      .limit(10)
    setRecentes((data ?? []) as unknown as LancamentoRecente[])
    setLoadingRecentes(false)
  }, [origem])

  useEffect(() => { loadRecentes() }, [loadRecentes])

  // Botão "Pagar com Crypto" (só Tipo Pagamento) — preenche o Valor já
  // corrigido pelo % de Crypto Rebate cadastrado no clube (ver
  // corrigirValorCrypto, mesma fórmula do "Total Crypto Rebate" em Acertos).
  // O usuário ainda confere e clica em Lançar normalmente.
  function handlePagarCrypto() {
    const acerto = acertosClube.find((a) => a.id === acertoId)
    if (!acerto) return
    const corrigido = corrigirValorCrypto(Math.abs(acerto.valor_acerto), clubeCryptoPct)
    setValor(corrigido.toFixed(2).replace('.', ','))
    setPagoCrypto(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clubeId) { setError('Escolha o clube.'); return }
    const valorNum = Number(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) { setError('Informe um valor válido.'); return }
    if (acertoObrigatorio && !acertoId) { setError(t('pagamentos.qual_acerto_obrigatorio')); return }

    // Caução do Suporte pula direto pra fila da Genia — fácil de lançar
    // duplicado sem querer, então avisa antes se já existe algo igual.
    if (origem === 'suporte' && tipo === 'caucao') {
      setError(null)
      const { data: existentes } = await supabase
        .from('lancamentos')
        .select('id')
        .eq('clube_id', clubeId)
        .eq('tipo', 'caucao')
        .eq('valor', valorNum)
        .eq('data_lancamento', data)
        .limit(1)
      if ((existentes ?? []).length > 0 && !confirmandoDuplicata) {
        setConfirmandoDuplicata(true)
        return
      }
    }
    await criar(valorNum)
  }

  async function criar(valorNum: number) {
    setSaving(true); setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      // Genia sempre lança "em validação" até confirmar o pagamento. Suporte
      // não tem status — exceto Caução, que pula direto pra fila da Genia
      // (é como se ela mesma tivesse lançado, só falta ela validar).
      const status = origem === 'genia' || tipo === 'caucao' ? 'em_validacao' : null
      const { error: insErr } = await supabase.from('lancamentos').insert({
        clube_id: clubeId,
        tipo,
        natureza,
        valor: valorNum,
        descricao: descricao || null,
        data_lancamento: data,
        criado_por: userData.user?.id ?? null,
        origem,
        status,
        acerto_id: ehPagamentoComAcerto && acertoId ? acertoId : null,
        pago_crypto: tipo === 'pagamento' && pagoCrypto,
      })
      if (insErr) throw insErr
      setValor('')
      setDescricao('')
      setData(hoje())
      setConfirmandoDuplicata(false)
      setAcertoId('')
      setPagoCrypto(false)
      await loadRecentes()
      onCreated?.()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

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
      onCreated?.()
    } catch (err) {
      setErroExclusao(errMsg(err))
    } finally {
      setDeletando(false)
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
              onChange={v => { setClubeId(v); setConfirmandoDuplicata(false) }}
              opcoes={clubes.map(c => ({ id: c.id, nome: c.name }))}
              placeholder={t('common.selecione')}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.tipo')}</label>
            <div className="flex gap-2">
              <select value={tipo} onChange={(e) => { setTipo(e.target.value); setConfirmandoDuplicata(false); setPagoCrypto(false) }} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
                {TIPOS_FORM.map((tp) => <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>)}
              </select>
              {tipo === 'pagamento' && clubeCryptoPct > 0 && (
                <button
                  type="button"
                  onClick={handlePagarCrypto}
                  disabled={!acertoId}
                  title={acertoId ? t('lancamento.pagar_crypto_titulo', { pct: String(clubeCryptoPct) }) : t('pagamentos.qual_acerto_obrigatorio')}
                  className="shrink-0 px-3 py-2.5 rounded-lg border border-gold bg-gold text-surface text-sm font-semibold hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {t('lancamento.pagar_crypto')}
                </button>
              )}
            </div>
          </div>
        </div>

        {ehPagamentoComAcerto && clubeId && (
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t(acertoObrigatorio ? 'pagamentos.qual_acerto' : 'pagamentos.qual_acerto_antecipacao')}</label>
            <select value={acertoId} onChange={(e) => { setAcertoId(e.target.value); setPagoCrypto(false) }} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
              <option value="">{t('pagamentos.selecione_acerto')}</option>
              {acertosClube.map((a) => <option key={a.id} value={a.id}>{formatPeriodoAcerto(a)}</option>)}
            </select>
            {acertosClube.length === 0 && <p className="text-xs text-gray-500 mt-1.5">{t('pagamentos.nenhum_acerto_do_clube')}</p>}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.natureza')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNatureza('credito')}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${natureza === 'credito' ? 'border-success/50 bg-success/10 text-success' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
              >
                {t('lancamento.credito')}
              </button>
              <button
                type="button"
                onClick={() => setNatureza('debito')}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${natureza === 'debito' ? 'border-alert/50 bg-alert/10 text-alert' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
              >
                {t('lancamento.debito')}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.valor')}</label>
            <input type="text" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setConfirmandoDuplicata(false); setPagoCrypto(false) }} placeholder="0,00" className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.data')}</label>
            <input type="date" value={data} onChange={(e) => { setData(e.target.value); setConfirmandoDuplicata(false) }} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.descricao')}</label>
          <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={t('lancamento.descricao_placeholder')} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>

        {confirmandoDuplicata && (
          <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-sm space-y-2">
            <p className="text-alert font-medium">{t('lancamento.caucao_duplicata_titulo')}</p>
            <p className="text-gray-400 text-xs">{t('lancamento.caucao_duplicata_desc')}</p>
          </div>
        )}

        {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

        <div className="flex justify-end gap-2">
          {confirmandoDuplicata && (
            <button type="button" onClick={() => setConfirmandoDuplicata(false)} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">
              {t('common.cancelar')}
            </button>
          )}
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {confirmandoDuplicata ? t('lancamento.confirmar_mesmo_assim') : t('lancamento.lancar')}
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
                    <p className="text-sm text-white">{l.clubs?.name ?? '—'} <span className="text-gray-500">· {t(TIPOS.find((tp) => tp.value === l.tipo)?.labelKey ?? l.tipo)}</span></p>
                    <p className="text-xs text-gray-500">{new Date(l.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}{l.descricao ? ` · ${l.descricao}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${l.status === 'pago' ? 'border-success/30 bg-success/10 text-success' : 'border-gold/30 bg-gold/10 text-gold'}`}>
                        {t(`lancamento.status.${l.status}`)}
                      </span>
                    )}
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
        onSaved={() => { setEditando(null); loadRecentes(); onCreated?.() }}
      />
      <ConfirmDelete
        open={!!excluindo}
        name={excluindo ? `${t(TIPOS.find((tp) => tp.value === excluindo.tipo)?.labelKey ?? excluindo.tipo)} · ${formatMoeda(excluindo.valor)}` : ''}
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

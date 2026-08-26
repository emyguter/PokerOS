'use client'
import { useState, useEffect, useMemo } from 'react'
import { X, Loader2 } from 'lucide-react'
import { BuscaSelect } from '@/components/BuscaSelect'
import { calcularAcordo, type DividaForm, type DividaRow, type TipoDivida } from '@/lib/dividas'

interface ClubeOpcao { id: string; name: string }

interface Props {
  open: boolean
  clubes: ClubeOpcao[]
  onClose: () => void
  onSave: (form: DividaForm) => void
  saving: boolean
  error?: string | null
  // Presente = modal em modo edição (título muda, clube travado). Ausente =
  // criação normal.
  editing?: DividaRow | null
  // Só relevante em edição: false trava Valor/Juros/Parcelas/Data porque já
  // tem parcela paga (ver podeEditarTermosDivida) — Descrição e Pagar com
  // Rake continuam editáveis sempre.
  podeEditarTermos?: boolean
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50'
const inputLockedCls = 'w-full bg-surface/50 border border-white/5 rounded-lg px-3 py-2.5 text-gray-400 text-sm cursor-not-allowed'

export function DividaModal({ open, clubes, onClose, onSave, saving, error, editing, podeEditarTermos = true }: Props) {
  const [clubeId, setClubeId] = useState('')
  const [tipo, setTipo] = useState<TipoDivida>('simples')
  const [valorIntegral, setValorIntegral] = useState('')
  const [descricao, setDescricao] = useState('')
  const [pagamentoMinimo, setPagamentoMinimo] = useState('')
  const [quantidadeParcelas, setQuantidadeParcelas] = useState('0')
  const [jurosAtivo, setJurosAtivo] = useState(false)
  const [jurosPct, setJurosPct] = useState('')
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState(hoje())
  const [pagoComRake, setPagoComRake] = useState(true)
  const [rakebackPct, setRakebackPct] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      setClubeId(editing.clube_id); setTipo(editing.tipo); setValorIntegral(String(editing.valor_integral))
      setDescricao(editing.descricao ?? '')
      setPagamentoMinimo(editing.pagamento_minimo != null ? String(editing.pagamento_minimo) : '')
      setQuantidadeParcelas(editing.quantidade_parcelas != null ? String(editing.quantidade_parcelas) : '0')
      setJurosAtivo(editing.juros_ativo); setJurosPct(editing.juros_pct != null ? String(editing.juros_pct) : '')
      setDataPrimeiraParcela(editing.data_primeira_parcela ?? hoje())
      setPagoComRake(editing.pago_com_rake)
      setRakebackPct(editing.rakeback_pct != null ? String(editing.rakeback_pct) : '')
    } else {
      setClubeId(''); setTipo('simples'); setValorIntegral(''); setDescricao('')
      setPagamentoMinimo(''); setQuantidadeParcelas('0'); setJurosAtivo(false); setJurosPct('')
      setDataPrimeiraParcela(hoje()); setPagoComRake(true); setRakebackPct('')
    }
  }, [open, editing])

  // Pagar com Rake ligado num Acordo = quita tudo de uma vez no próximo
  // Acerto, sem cronograma de parcelas — os campos de parcelamento somem
  // (confirmado pelo Cássio: "se for pagar com rake, não haverá parcela").
  const semCronograma = tipo === 'acordo' && pagoComRake
  const travado = tipo === 'acordo' && !podeEditarTermos
  // Dívida Simples com Pagar com Rake ligado pode descontar aos poucos (só
  // um % do Rake por semana) em vez de tudo de uma vez — % Rakeback vazio
  // continua com o comportamento de sempre (desconta o Valor Integral
  // inteiro na próxima semana). Pagamento Mínimo aqui é o piso: semana em
  // que o % render menos que ele, não desconta nada (confirmado pelo
  // Cássio com a planilha de referência do Sevens Pkr House).
  const simplesComRake = tipo === 'simples' && pagoComRake

  const preview = useMemo(() => {
    const valor = Number(valorIntegral.replace(',', '.'))
    const parcelas = Number(quantidadeParcelas)
    if (tipo !== 'acordo' || semCronograma || !valor || !parcelas || parcelas < 1) return null
    return calcularAcordo({
      valorIntegral: valor,
      jurosAtivo,
      jurosPct: jurosPct ? Number(jurosPct.replace(',', '.')) : null,
      quantidadeParcelas: parcelas,
      pagamentoMinimo: pagamentoMinimo ? Number(pagamentoMinimo.replace(',', '.')) : null,
      dataPrimeiraParcela,
    })
  }, [tipo, semCronograma, valorIntegral, quantidadeParcelas, jurosAtivo, jurosPct, pagamentoMinimo, dataPrimeiraParcela])

  if (!open) return null

  const podeSalvar = !!clubeId && !!Number(valorIntegral.replace(',', '.'))
    && (tipo === 'simples' || semCronograma || (!!Number(quantidadeParcelas) && !!dataPrimeiraParcela))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!podeSalvar) return
    onSave({
      clube_id: clubeId,
      tipo,
      valor_integral: Number(valorIntegral.replace(',', '.')),
      descricao: descricao || null,
      pagamento_minimo: (tipo === 'acordo' && !semCronograma || simplesComRake) && pagamentoMinimo ? Number(pagamentoMinimo.replace(',', '.')) : null,
      quantidade_parcelas: tipo === 'acordo' && !semCronograma ? Number(quantidadeParcelas) : null,
      juros_ativo: tipo === 'acordo' && !semCronograma && jurosAtivo,
      juros_pct: tipo === 'acordo' && !semCronograma && jurosAtivo && jurosPct ? Number(jurosPct.replace(',', '.')) : null,
      data_primeira_parcela: tipo === 'acordo' && !semCronograma ? dataPrimeiraParcela : null,
      pago_com_rake: pagoComRake,
      rakeback_pct: simplesComRake && rakebackPct ? Number(rakebackPct.replace(',', '.')) : null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{editing ? 'Editar Dívida' : 'Nova Dívida'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Clube<span className="text-gray-500 ml-1">*</span></label>
              {editing ? (
                <input type="text" value={editing.clube_nome} disabled className={inputLockedCls} />
              ) : (
                <BuscaSelect value={clubeId} onChange={setClubeId} opcoes={clubes.map((c) => ({ id: c.id, nome: c.name }))} placeholder="— Selecione —" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!!editing} onClick={() => setTipo('simples')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${tipo === 'simples' ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                Dívida Simples
                <p className="text-xs font-normal text-gray-500 mt-0.5">Só um valor, sem parcelamento</p>
              </button>
              <button type="button" disabled={!!editing} onClick={() => setTipo('acordo')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${tipo === 'acordo' ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                Acordo
                <p className="text-xs font-normal text-gray-500 mt-0.5">Parcelado, com juros opcional, ou pago com Rake de uma vez</p>
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Valor Integral<span className="text-gray-500 ml-1">*</span></label>
              {travado ? (
                <input type="text" value={fmt(Number(valorIntegral.replace(',', '.')) || 0)} disabled className={inputLockedCls} />
              ) : (
                <input type="text" inputMode="decimal" value={valorIntegral} onChange={(e) => setValorIntegral(e.target.value)} placeholder="Ex: 1000" className={inputCls} />
              )}
              {travado && <p className="text-xs text-gray-600 mt-1">Já tem parcela paga — termos travados. Pra mudar, interrompa e crie um Acordo filho.</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Descrição (opcional)</label>
              <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: motivo da dívida" className={inputCls} />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer w-fit">
                <div onClick={() => setPagoComRake(!pagoComRake)} className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${pagoComRake ? 'bg-gold' : 'bg-white/10'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${pagoComRake ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <span className="text-sm text-gray-300">Pagar com Rake</span>
              </label>
              <p className="text-xs text-gray-500">
                {tipo === 'acordo'
                  ? 'Ligado, quita tudo de uma vez no próximo Acerto processado, sem cronograma de parcelas. Desligado, define um cronograma parcelado abaixo (dá pra ligar Pagar com Rake parcela a parcela depois, na tela de Dívidas).'
                  : 'Sem % Rakeback preenchido abaixo, desconta o Valor Integral inteiro de uma vez no próximo Acerto. Com % Rakeback, desconta aos poucos — só esse % do Rake por semana, até quitar. Desligado, o clube paga por fora e alguém marca como quitada na mão.'}
              </p>
            </div>

            {simplesComRake && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">% Rakeback (opcional)</label>
                  <input type="text" inputMode="decimal" value={rakebackPct} onChange={(e) => setRakebackPct(e.target.value)} placeholder="Ex: 10" className={inputCls} />
                  <p className="text-xs text-gray-500 mt-1.5">Vazio = desconta tudo de uma vez, como sempre foi.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Pagamento Mínimo (opcional)</label>
                  <input type="text" inputMode="decimal" value={pagamentoMinimo} onChange={(e) => setPagamentoMinimo(e.target.value)} placeholder="Piso semanal" disabled={!rakebackPct} className={rakebackPct ? inputCls : inputLockedCls} />
                  <p className="text-xs text-gray-500 mt-1.5">Semana em que o % render menos que isso, não desconta nada.</p>
                </div>
              </div>
            )}

            {tipo === 'acordo' && !semCronograma && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Quantidade de Parcelas<span className="text-gray-500 ml-1">*</span></label>
                    {travado ? (
                      <input type="text" value={quantidadeParcelas} disabled className={inputLockedCls} />
                    ) : (
                      <input type="number" min="1" step="1" value={quantidadeParcelas} onChange={(e) => setQuantidadeParcelas(e.target.value)} className={inputCls} />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Pagamento Mínimo (opcional)</label>
                    {travado ? (
                      <input type="text" value={pagamentoMinimo} disabled className={inputLockedCls} />
                    ) : (
                      <input type="text" inputMode="decimal" value={pagamentoMinimo} onChange={(e) => setPagamentoMinimo(e.target.value)} placeholder="Piso da parcela" className={inputCls} />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Data da 1ª Parcela<span className="text-gray-500 ml-1">*</span></label>
                  {travado ? (
                    <input type="text" value={dataPrimeiraParcela} disabled className={inputLockedCls} />
                  ) : (
                    <input type="date" value={dataPrimeiraParcela} onChange={(e) => setDataPrimeiraParcela(e.target.value)} className={inputCls} />
                  )}
                  <p className="text-xs text-gray-500 mt-1.5">As próximas vencem semanalmente a partir dessa data.</p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer w-fit">
                    <div onClick={() => !travado && setJurosAtivo(!jurosAtivo)} className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${jurosAtivo ? 'bg-gold' : 'bg-white/10'} ${travado ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${jurosAtivo ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                    <span className="text-sm text-gray-300">Juros</span>
                  </label>
                  {jurosAtivo && (
                    travado ? (
                      <input type="text" value={jurosPct} disabled className={inputLockedCls} />
                    ) : (
                      <input type="text" inputMode="decimal" value={jurosPct} onChange={(e) => setJurosPct(e.target.value)} placeholder="% por parcela, composto" className={inputCls} />
                    )
                  )}
                  {jurosAtivo && <p className="text-xs text-gray-500">Incide por parcela conforme o período: parcela N = base × (1+juros%)^N — cresce a cada semana, não é um valor único somado no início.</p>}
                </div>

                {preview && (
                  <div className="rounded-lg border border-white/10 bg-surface2 p-3 space-y-2">
                    <p className="text-xs text-gray-400">
                      Valor {jurosAtivo ? 'com juros' : 'total'}: <span className="text-white font-medium">{fmt(preview.valorComJuros)}</span>
                      {' · '}Parcela base: <span className="text-white font-medium">{fmt(preview.valorParcela)}</span>
                      {' · '}{preview.quantidadeParcelasFinal}x
                      {preview.usouPagamentoMinimo && <span className="text-gold"> (ajustado pelo Pagamento Mínimo)</span>}
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {preview.parcelas.map((p) => (
                        <div key={p.numero} className="flex justify-between text-xs text-gray-500">
                          <span>Parcela {p.numero} — {new Date(p.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          <span className="text-gray-300">{fmt(p.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving || !podeSalvar} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useMemo } from 'react'
import { X, Loader2 } from 'lucide-react'
import { BuscaSelect } from '@/components/BuscaSelect'
import { calcularAcordo, type DividaForm, type TipoDivida } from '@/lib/dividas'

interface ClubeOpcao { id: string; name: string }

interface Props {
  open: boolean
  clubes: ClubeOpcao[]
  onClose: () => void
  onSave: (form: DividaForm) => void
  saving: boolean
  error?: string | null
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50'

export function DividaModal({ open, clubes, onClose, onSave, saving, error }: Props) {
  const [clubeId, setClubeId] = useState('')
  const [tipo, setTipo] = useState<TipoDivida>('simples')
  const [valorIntegral, setValorIntegral] = useState('')
  const [descricao, setDescricao] = useState('')
  const [pagamentoMinimo, setPagamentoMinimo] = useState('')
  const [quantidadeParcelas, setQuantidadeParcelas] = useState('4')
  const [jurosAtivo, setJurosAtivo] = useState(false)
  const [jurosPct, setJurosPct] = useState('')
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState(hoje())

  useEffect(() => {
    if (!open) return
    setClubeId(''); setTipo('simples'); setValorIntegral(''); setDescricao('')
    setPagamentoMinimo(''); setQuantidadeParcelas('4'); setJurosAtivo(false); setJurosPct('')
    setDataPrimeiraParcela(hoje())
  }, [open])

  const preview = useMemo(() => {
    const valor = Number(valorIntegral.replace(',', '.'))
    const parcelas = Number(quantidadeParcelas)
    if (tipo !== 'acordo' || !valor || !parcelas || parcelas < 1) return null
    return calcularAcordo({
      valorIntegral: valor,
      jurosAtivo,
      jurosPct: jurosPct ? Number(jurosPct.replace(',', '.')) : null,
      quantidadeParcelas: parcelas,
      pagamentoMinimo: pagamentoMinimo ? Number(pagamentoMinimo.replace(',', '.')) : null,
      dataPrimeiraParcela,
    })
  }, [tipo, valorIntegral, quantidadeParcelas, jurosAtivo, jurosPct, pagamentoMinimo, dataPrimeiraParcela])

  if (!open) return null

  const podeSalvar = !!clubeId && !!Number(valorIntegral.replace(',', '.')) && (tipo === 'simples' || (!!Number(quantidadeParcelas) && !!dataPrimeiraParcela))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!podeSalvar) return
    onSave({
      clube_id: clubeId,
      tipo,
      valor_integral: Number(valorIntegral.replace(',', '.')),
      descricao: descricao || null,
      pagamento_minimo: tipo === 'acordo' && pagamentoMinimo ? Number(pagamentoMinimo.replace(',', '.')) : null,
      quantidade_parcelas: tipo === 'acordo' ? Number(quantidadeParcelas) : null,
      juros_ativo: tipo === 'acordo' && jurosAtivo,
      juros_pct: tipo === 'acordo' && jurosAtivo && jurosPct ? Number(jurosPct.replace(',', '.')) : null,
      data_primeira_parcela: tipo === 'acordo' ? dataPrimeiraParcela : null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">Nova Dívida</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Clube<span className="text-gray-500 ml-1">*</span></label>
              <BuscaSelect value={clubeId} onChange={setClubeId} opcoes={clubes.map((c) => ({ id: c.id, nome: c.name }))} placeholder="— Selecione —" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTipo('simples')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${tipo === 'simples' ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                Dívida Simples
                <p className="text-xs font-normal text-gray-500 mt-0.5">Só um valor, sem parcelamento</p>
              </button>
              <button type="button" onClick={() => setTipo('acordo')} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${tipo === 'acordo' ? 'border-gold/50 bg-gold/5 text-white' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                Acordo
                <p className="text-xs font-normal text-gray-500 mt-0.5">Parcelado, com juros opcional</p>
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Valor Integral<span className="text-gray-500 ml-1">*</span></label>
              <input type="text" inputMode="decimal" value={valorIntegral} onChange={(e) => setValorIntegral(e.target.value)} placeholder="Ex: 1000" className={inputCls} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Descrição (opcional)</label>
              <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: motivo da dívida" className={inputCls} />
            </div>

            {tipo === 'acordo' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Quantidade de Parcelas<span className="text-gray-500 ml-1">*</span></label>
                    <input type="number" min="1" step="1" value={quantidadeParcelas} onChange={(e) => setQuantidadeParcelas(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">Pagamento Mínimo (opcional)</label>
                    <input type="text" inputMode="decimal" value={pagamentoMinimo} onChange={(e) => setPagamentoMinimo(e.target.value)} placeholder="Piso da parcela" className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Data da 1ª Parcela<span className="text-gray-500 ml-1">*</span></label>
                  <input type="date" value={dataPrimeiraParcela} onChange={(e) => setDataPrimeiraParcela(e.target.value)} className={inputCls} />
                  <p className="text-xs text-gray-500 mt-1.5">As próximas vencem semanalmente a partir dessa data.</p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer w-fit">
                    <div onClick={() => setJurosAtivo(!jurosAtivo)} className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${jurosAtivo ? 'bg-gold' : 'bg-white/10'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${jurosAtivo ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                    <span className="text-sm text-gray-300">Juros</span>
                  </label>
                  {jurosAtivo && (
                    <input type="text" inputMode="decimal" value={jurosPct} onChange={(e) => setJurosPct(e.target.value)} placeholder="% sobre o valor integral" className={inputCls} />
                  )}
                </div>

                {preview && (
                  <div className="rounded-lg border border-white/10 bg-surface2 p-3 space-y-2">
                    <p className="text-xs text-gray-400">
                      Valor {jurosAtivo ? 'com juros' : 'total'}: <span className="text-white font-medium">{fmt(preview.valorComJuros)}</span>
                      {' · '}Parcela: <span className="text-white font-medium">{fmt(preview.valorParcela)}</span>
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

'use client'
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { DividaForm, DividaRow } from '@/lib/dividas'

interface Props {
  open: boolean
  divida: DividaRow | null
  saldoRestante: number
  onClose: () => void
  onSave: (novoTermos: Omit<DividaForm, 'clube_id' | 'valor_integral' | 'tipo'>) => void
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

// Renegociação: encerra o Acordo atual (status vira 'interrompido', saldo
// trava) e abre um Acordo filho já com esse saldo como Valor Integral —
// aqui só pergunta os termos novos (confirmado pelo Cássio).
export function InterromperAcordoModal({ open, divida, saldoRestante, onClose, onSave, saving, error }: Props) {
  const [quantidadeParcelas, setQuantidadeParcelas] = useState('0')
  const [jurosAtivo, setJurosAtivo] = useState(false)
  const [jurosPct, setJurosPct] = useState('')
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState(hoje())
  const [pagoComRake, setPagoComRake] = useState(true)

  useEffect(() => {
    if (!open) return
    setQuantidadeParcelas('0'); setJurosAtivo(false); setJurosPct('')
    setDataPrimeiraParcela(hoje()); setPagoComRake(true)
  }, [open])

  if (!open || !divida) return null

  const semCronograma = pagoComRake
  const podeSalvar = semCronograma || (!!Number(quantidadeParcelas) && !!dataPrimeiraParcela)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!podeSalvar) return
    onSave({
      descricao: divida!.descricao,
      pagamento_minimo: null,
      quantidade_parcelas: semCronograma ? null : Number(quantidadeParcelas),
      juros_ativo: !semCronograma && jurosAtivo,
      juros_pct: !semCronograma && jurosAtivo && jurosPct ? Number(jurosPct.replace(',', '.')) : null,
      data_primeira_parcela: semCronograma ? null : dataPrimeiraParcela,
      pago_com_rake: pagoComRake,
      rakeback_pct: null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">Interromper e Renegociar</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            <p className="text-xs text-gray-500">
              Encerra o Acordo de <span className="text-white">{divida.clube_nome}</span> como está (fica &quot;Interrompido&quot;) e abre um Acordo filho novo, já com o saldo que faltava como Valor Integral.
            </p>
            <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
              <p className="text-xs text-gray-400">Saldo a renegociar</p>
              <p className="text-lg font-semibold text-gold">{fmt(saldoRestante)}</p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer w-fit">
                <div onClick={() => setPagoComRake(!pagoComRake)} className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${pagoComRake ? 'bg-gold' : 'bg-white/10'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${pagoComRake ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <span className="text-sm text-gray-300">Pagar com Rake</span>
              </label>
              <p className="text-xs text-gray-500">
                {pagoComRake ? 'Quita tudo de uma vez no próximo Acerto processado, sem cronograma de parcelas.' : 'Define um cronograma parcelado abaixo.'}
              </p>
            </div>

            {!semCronograma && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Quantidade de Parcelas<span className="text-gray-500 ml-1">*</span></label>
                  <input type="number" min="1" step="1" value={quantidadeParcelas} onChange={(e) => setQuantidadeParcelas(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Data da 1ª Parcela<span className="text-gray-500 ml-1">*</span></label>
                  <input type="date" value={dataPrimeiraParcela} onChange={(e) => setDataPrimeiraParcela(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer w-fit">
                    <div onClick={() => setJurosAtivo(!jurosAtivo)} className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${jurosAtivo ? 'bg-gold' : 'bg-white/10'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${jurosAtivo ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                    <span className="text-sm text-gray-300">Juros</span>
                  </label>
                  {jurosAtivo && (
                    <input type="text" inputMode="decimal" value={jurosPct} onChange={(e) => setJurosPct(e.target.value)} placeholder="% por parcela, composto" className={inputCls} />
                  )}
                </div>
              </>
            )}

            {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}
          </div>
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving || !podeSalvar} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Interromper e Criar Acordo Filho
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

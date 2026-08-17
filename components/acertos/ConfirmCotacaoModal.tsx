'use client'
import { useState, useEffect } from 'react'
import { Loader2, DollarSign } from 'lucide-react'

interface Props {
  clube: { name: string; cotacao: number | null }
  saving: boolean
  onConfirmar: () => void
  onSalvar: (valor: number) => void
}

// Um clube por vez de uma fila (AcertosView monta/desmonta esse modal
// trocando `clube`) — mostra a Cotação atual e pergunta se segue com ela;
// se não, abre o campo pra digitar o valor novo antes de continuar. Sem
// cotação salva ainda, já abre direto no campo (nada pra confirmar).
// AcertosView.tsx é uma tela antiga que não usa o sistema de i18n (strings
// direto em pt-BR) — mantém o mesmo padrão aqui pra não misturar estilos.
export function ConfirmCotacaoModal({ clube, saving, onConfirmar, onSalvar }: Props) {
  const [editando, setEditando] = useState(clube.cotacao == null)
  const [valor, setValor] = useState(clube.cotacao != null ? String(clube.cotacao) : '')

  useEffect(() => {
    setEditando(clube.cotacao == null)
    setValor(clube.cotacao != null ? String(clube.cotacao) : '')
  }, [clube])

  function salvar() {
    const num = Number(valor.replace(',', '.'))
    if (!valor || Number.isNaN(num) || num <= 0) return
    onSalvar(num)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-gold/10 text-gold"><DollarSign size={18} /></div>
          <h2 className="text-lg font-semibold text-white">Cotação — {clube.name}</h2>
        </div>

        {editando ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">Qual o valor a ser considerado?</label>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') salvar() }}
              placeholder="Ex: 5.20"
              className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
            />
            <div className="flex items-center justify-end gap-3 pt-1">
              {clube.cotacao != null && (
                <button onClick={() => setEditando(false)} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Cancelar</button>
              )}
              <button onClick={salvar} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
                {saving && <Loader2 size={14} className="animate-spin" />}Salvar e continuar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Cotação sendo considerada: <span className="text-white font-medium">{clube.cotacao}</span>. Deseja seguir com esse valor?</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setEditando(true)} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">Não</button>
              <button onClick={onConfirmar} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
                {saving && <Loader2 size={14} className="animate-spin" />}Sim
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

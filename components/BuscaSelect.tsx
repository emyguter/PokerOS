'use client'
import { useState } from 'react'

interface Opcao { id: string; nome: string }

interface Props {
  value: string
  onChange: (id: string) => void
  opcoes: Opcao[]
  placeholder?: string
  // Rótulo pra opção "nenhum selecionado" (ex: "Todas as ligas", "Nenhum (agente direto)") — sem isso, o campo só fica vazio quando não há seleção.
  vazio?: string
  className?: string
  disabled?: boolean
}

const DEFAULT_CLS = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'

export function BuscaSelect({ value, onChange, opcoes, placeholder, vazio, className, disabled }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')

  const selecionada = opcoes.find(o => o.id === value)
  const filtradas = busca.trim()
    ? opcoes.filter(o => o.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : opcoes

  function selecionar(id: string) {
    onChange(id)
    setBusca('')
    setAberto(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        disabled={disabled}
        value={aberto ? busca : (selecionada?.nome ?? vazio ?? '')}
        onFocus={() => setAberto(true)}
        onChange={e => setBusca(e.target.value)}
        onBlur={() => setAberto(false)}
        onKeyDown={e => { if (e.key === 'Escape') { setBusca(''); setAberto(false); (e.target as HTMLInputElement).blur() } }}
        placeholder={placeholder}
        className={className ?? DEFAULT_CLS}
      />
      {aberto && (
        <div
          onMouseDown={e => e.preventDefault()}
          className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-surface shadow-2xl"
        >
          {vazio && (
            <button type="button" onClick={() => selecionar('')} className="block w-full text-left px-3 py-2 text-sm text-gray-400 italic hover:bg-white/5 hover:text-white transition-colors">
              {vazio}
            </button>
          )}
          {filtradas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500 italic">Nenhum resultado.</p>
          ) : (
            filtradas.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => selecionar(o.id)}
                className={`block w-full text-left px-3 py-2 text-sm transition-colors ${o.id === value ? 'text-gold bg-gold/5' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
              >
                {o.nome}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

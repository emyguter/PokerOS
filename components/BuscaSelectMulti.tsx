'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

interface Opcao { id: string; nome: string }

interface Props {
  value: string[]
  onChange: (ids: string[]) => void
  opcoes: Opcao[]
  placeholder?: string
  vazio?: string
  className?: string
}

// Mesma ideia do BuscaSelect, mas pra escolher vários de uma vez (tipo Excel:
// todos, um só, ou vários aleatórios) — usado em filtro de relatório.
export function BuscaSelectMulti({ value, onChange, opcoes, placeholder, vazio, className }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')

  const selecionadas = opcoes.filter(o => value.includes(o.id))
  const filtradas = busca.trim()
    ? opcoes.filter(o => o.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : opcoes

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  return (
    <div className="relative">
      <div
        onClick={() => setAberto(true)}
        className={className ?? 'w-full min-h-[42px] bg-surface border border-white/10 rounded-lg px-2 py-1.5 flex flex-wrap items-center gap-1 cursor-text focus-within:border-gold/50'}
      >
        {selecionadas.length === 0 && !aberto && (
          <span className="text-sm text-gray-600 px-1">{vazio ?? placeholder}</span>
        )}
        {selecionadas.map(s => (
          <span key={s.id} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gold/40 bg-gold/5 text-xs text-white">
            {s.nome}
            <button type="button" onClick={e => { e.stopPropagation(); toggle(s.id) }} className="text-gray-500 hover:text-alert"><X size={11} /></button>
          </span>
        ))}
        <input
          type="text"
          value={busca}
          onFocus={() => setAberto(true)}
          onChange={e => setBusca(e.target.value)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          placeholder={selecionadas.length > 0 ? '' : placeholder}
          className="flex-1 min-w-[80px] bg-transparent text-white text-sm placeholder-gray-600 focus:outline-none px-1 py-1"
        />
      </div>
      {aberto && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-surface shadow-2xl">
          {selecionadas.length > 0 && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onChange([])} className="block w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-white/5 hover:text-white transition-colors italic">
              Limpar seleção
            </button>
          )}
          {filtradas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500 italic">Nenhum resultado.</p>
          ) : (
            filtradas.map(o => {
              const marcada = value.includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => toggle(o.id)}
                  className={`block w-full text-left px-3 py-2 text-sm transition-colors ${marcada ? 'text-gold bg-gold/5' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                >
                  {marcada ? '✓ ' : ''}{o.nome}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

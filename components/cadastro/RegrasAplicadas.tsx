'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import type { EntidadeTipo } from '@/lib/types'
import { getRegrasDaEntidade, type RegraAplicada } from '@/lib/cadastro-api'

interface Props {
  entidadeTipo: EntidadeTipo
  entidadeId: string | null
}

const LABEL_TIPO: Record<EntidadeTipo, string> = {
  plataforma: 'App',
  mega_liga: 'Mega Liga',
  superliga: 'Superliga',
  liga: 'Liga',
  clube: 'Clube',
  agente: 'Agente',
  jogador: 'Jogador',
}

// Painel read-only — a criação/edição de regra e o vínculo com Liga/Clube/
// Agente agora vivem só na tela de Regras (/admin/regras). Esse cadastro
// só mostra o que já está vinculado, pra quem tá editando saber de onde
// vem a taxa aplicada.
export function RegrasAplicadas({ entidadeTipo, entidadeId }: Props) {
  const [regras, setRegras] = useState<RegraAplicada[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entidadeId) { setRegras([]); return }
    setLoading(true)
    getRegrasDaEntidade(entidadeTipo, entidadeId)
      .then(setRegras)
      .finally(() => setLoading(false))
  }, [entidadeTipo, entidadeId])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Regras aplicadas</p>
        <Link href="/admin/regras" className="flex items-center gap-1 text-xs text-gold hover:underline">
          <ListChecks size={12} />gerenciar em Regras
        </Link>
      </div>

      {!entidadeId ? (
        <p className="text-xs text-gray-500 italic">Salve o cadastro primeiro pra poder vincular uma regra a ele.</p>
      ) : loading ? (
        <p className="text-xs text-gray-500">Carregando...</p>
      ) : regras.length === 0 ? (
        <p className="text-xs text-gray-500 italic">Nenhuma regra vinculada ainda.</p>
      ) : (
        <div className="space-y-2">
          {regras.map(r => (
            <div key={r.regra_id} className="p-3 bg-surface2 rounded-lg border border-white/10 space-y-2">
              <p className="text-xs text-gray-400">
                {r.de_nome && (
                  <>Vem de <span className="text-gold font-medium">{LABEL_TIPO[r.de_tipo!]} {r.de_nome}</span>: </>
                )}
                <span className="text-white font-medium">{r.regra_nome}</span>
              </p>
              {r.linhas.length > 0 ? (
                <div className="space-y-1.5">
                  {r.linhas.map((linha, i) => (
                    <div key={i} className="text-xs text-gray-400 bg-surface px-3 py-2 rounded border border-white/5">
                      {linha.split('→').map((parte, pi) => pi === 0 ? parte : <span key={pi}>→<span className="text-gold">{parte}</span></span>)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">Regra ainda sem condições configuradas.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

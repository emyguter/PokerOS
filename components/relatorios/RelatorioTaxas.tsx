'use client'
import { useState, useEffect, useCallback } from 'react'
import { buscarResumoTaxas, type ResumoTaxaClube, type TaxaCampoResumo } from '@/lib/relatorio-taxas'
import { LABEL_SETTLEMENT } from '@/lib/types'
import { errMsg } from '@/lib/errors'

function Celula({ campo }: { campo: TaxaCampoResumo | null }) {
  if (!campo) return <span className="text-gray-700">—</span>
  return (
    <span className={campo.variavel ? 'text-gold' : 'text-gray-300'} title={campo.variavel ? 'Faixa variável, via Regra vinculada' : 'Percentual fixo do cadastro'}>
      {campo.valor}
    </span>
  )
}

function CelulaPct({ v }: { v: number | null }) {
  return v == null ? <span className="text-gray-700">—</span> : <span className="text-gray-300">{v}%</span>
}

export function RelatorioTaxas() {
  const [linhas, setLinhas] = useState<ResumoTaxaClube[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setLinhas(await buscarResumoTaxas()) }
    catch (e) { setError(errMsg(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Percentual <span className="text-gold">dourado</span> = faixa variável (Regra vinculada); percentual cinza = fixo do cadastro. Colunas em branco não se aplicam ao tipo de cobrança daquele clube.
      </p>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface2">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Clube</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tipo de cobrança</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fee MTT</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fee Cash</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Taxa Operacional</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">SpinUp</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Taxa da Liga</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Rebate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Crypto Rebate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Rakeback</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Termos especiais</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-500 text-sm">Carregando...</td></tr>
              ) : linhas.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-500 text-sm">Nenhum clube ativo cadastrado.</td></tr>
              ) : (
                linhas.map(l => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-gray-500">{l.externalId ?? '—'}</td>
                    <td className="px-4 py-3 text-white">{l.nome}</td>
                    <td className="px-4 py-3 text-gray-400">{LABEL_SETTLEMENT[l.settlementType] ?? l.settlementType}</td>
                    <td className="px-4 py-3"><Celula campo={l.feeMtt} /></td>
                    <td className="px-4 py-3"><Celula campo={l.feeCash} /></td>
                    <td className="px-4 py-3"><Celula campo={l.taxaOperacional} /></td>
                    <td className="px-4 py-3"><Celula campo={l.spinup} /></td>
                    <td className="px-4 py-3"><Celula campo={l.taxaLiga} /></td>
                    <td className="px-4 py-3"><CelulaPct v={l.rebatePct} /></td>
                    <td className="px-4 py-3"><CelulaPct v={l.cryptoRebatePct} /></td>
                    <td className="px-4 py-3"><CelulaPct v={l.rakebackPct} /></td>
                    <td className="px-4 py-3 max-w-[220px] truncate text-gray-300" title={l.termosEspeciais ?? undefined}>
                      {l.termosEspeciais ?? <span className="text-gray-700">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

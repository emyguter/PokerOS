'use client'
import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { DivergenciaTaxa } from '@/lib/acertos-engine'

const LABEL_CAMPO: Record<DivergenciaTaxa['campo'], string> = {
  fee_mtt: 'Fee MTT', fee_cash: 'Fee Cash', taxa_op: 'Taxa Operacional', spinup: 'SpinUp', rebate: 'Rebate', taxa_liga: 'Taxa da Liga',
}

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

// Recalcular sempre lê o cadastro do clube AO VIVO — se a % mudou desde a
// última vez que esse período foi calculado, o valor histórico (correto na
// época) seria sobrescrito sem aviso. Achado pelo Cássio: "os acertos tem
// que ser estáticos, não pode mudar nada neles sem recalcular... se alguém
// entrar lá pra olhar, putz mudou". Esse modal aparece só quando
// verificarDivergenciasTaxa (lib/acertos-engine.ts) acha diferença de
// verdade — pedido dele: "pode exibir um modal avisando sobre a taxa e o
// usuário escolhe se quer manter a taxa que tava naquele momento ou se quer
// considerar a atual".
export function DivergenciaTaxaModal({
  divergencias, calculando, onConfirmar, onCancelar,
}: {
  divergencias: DivergenciaTaxa[]
  calculando: boolean
  onConfirmar: (overridesEpoca: Set<string>) => void
  onCancelar: () => void
}) {
  const porClube = new Map<string, { nome: string; campos: DivergenciaTaxa[] }>()
  for (const d of divergencias) {
    const atual = porClube.get(d.clubId) ?? { nome: d.clubName, campos: [] }
    atual.campos.push(d)
    porClube.set(d.clubId, atual)
  }
  const clubes = [...porClube.entries()]

  // Default: mantém a % da época pra todo mundo (opção mais segura — é
  // exatamente o risco que esse modal existe pra evitar).
  const [escolhas, setEscolhas] = useState<Map<string, 'epoca' | 'atual'>>(
    new Map(clubes.map(([clubId]) => [clubId, 'epoca']))
  )

  function escolher(clubId: string, valor: 'epoca' | 'atual') {
    setEscolhas((prev) => new Map(prev).set(clubId, valor))
  }
  function aplicarATodos(valor: 'epoca' | 'atual') {
    setEscolhas(new Map(clubes.map(([clubId]) => [clubId, valor])))
  }
  function confirmar() {
    const overridesEpoca = new Set([...escolhas.entries()].filter(([, v]) => v === 'epoca').map(([id]) => id))
    onConfirmar(overridesEpoca)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !calculando && onCancelar()} />
      <div className="relative bg-surface2 border border-white/10 rounded-2xl w-full max-w-lg mx-4 p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-2 mb-1.5 shrink-0">
          <AlertTriangle size={18} className="text-gold" />
          <h4 className="text-white font-semibold text-base">Taxa mudou desde o último cálculo</h4>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed mb-4 shrink-0">
          O cadastro (ou uma Regra vinculada) desse{clubes.length > 1 ? 's' : ''} clube{clubes.length > 1 ? 's' : ''} mudou depois da última vez que esse período foi calculado. Escolha, pra cada um, se o recálculo mantém a taxa que valia na época ou passa a usar a taxa atual.
        </p>

        <div className="overflow-y-auto space-y-3 mb-4">
          {clubes.length > 1 && (
            <div className="flex items-center gap-3 text-xs pb-2 border-b border-white/10">
              <span className="text-gray-500">Aplicar a todos:</span>
              <button type="button" onClick={() => aplicarATodos('epoca')} className="text-gold hover:underline">Manter época</button>
              <button type="button" onClick={() => aplicarATodos('atual')} className="text-gray-400 hover:underline">Usar atual</button>
            </div>
          )}
          {clubes.map(([clubId, { nome, campos }]) => (
            <div key={clubId} className="rounded-lg border border-white/10 bg-surface px-3 py-2.5">
              <p className="text-sm text-white font-medium mb-2">{nome}</p>
              <table className="w-full text-xs mb-2.5">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left font-normal pb-1">Campo</th>
                    <th className="text-right font-normal pb-1">Época</th>
                    <th className="text-right font-normal pb-1">Atual</th>
                  </tr>
                </thead>
                <tbody>
                  {campos.map((c) => (
                    <tr key={c.campo}>
                      <td className="text-gray-300 py-0.5">{LABEL_CAMPO[c.campo]}</td>
                      <td className="text-right text-gray-300 py-0.5">{fmtPct(c.pctEpoca)}</td>
                      <td className="text-right text-gold py-0.5">{fmtPct(c.pctAtual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-gray-300">
                  <input type="radio" name={`escolha-${clubId}`} checked={escolhas.get(clubId) === 'epoca'} onChange={() => escolher(clubId, 'epoca')} className="accent-gold" />
                  Manter taxa da época
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-gray-300">
                  <input type="radio" name={`escolha-${clubId}`} checked={escolhas.get(clubId) === 'atual'} onChange={() => escolher(clubId, 'atual')} className="accent-gold" />
                  Usar taxa atual
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={onCancelar} disabled={calculando} className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-40">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={calculando} className="flex-1 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            {calculando && <Loader2 size={14} className="animate-spin" />}
            {calculando ? 'Recalculando…' : 'Confirmar e recalcular'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ListChecks, AlertTriangle } from 'lucide-react'
import type { EntidadeTipo, CampoClube } from '@/lib/types'
import { getRegrasDaEntidade, type RegraAplicada } from '@/lib/cadastro-api'

interface Props {
  entidadeTipo: EntidadeTipo
  entidadeId: string | null
  // Só usados quando entidadeTipo === 'clube', pra avisar quando Fee Cash ou
  // Fee MTT ficariam sem nenhuma taxa de verdade (nem regra vinculada, nem
  // % fixo) — nesse caso só uma parte do rake estaria sendo cobrada.
  settlementType?: string
  feeCashPct?: number | null
  feeMttPct?: number | null
}

const CAMPOS_CRITICOS: { campo: CampoClube; label: string }[] = [
  { campo: 'fee_cash', label: 'Fee Cash' },
  { campo: 'fee_mtt', label: 'Fee MTT' },
]

const LABEL_TIPO: Record<EntidadeTipo, string> = {
  plataforma: 'App',
  mega_liga: 'Mega Liga',
  superliga: 'Superliga',
  liga: 'Liga',
  clube: 'Clube',
  agente: 'Agente',
  jogador: 'Jogador',
}

const LABEL_CAMPO: Record<CampoClube, string> = {
  fee_mtt: 'Fee MTT', fee_cash: 'Fee Cash', taxa_op: 'Taxa Operacional', spinup: 'SpinUp',
}

function RegraCard({ r }: { r: RegraAplicada }) {
  return (
    <div className="p-3 bg-surface2 rounded-lg border border-white/10 space-y-2">
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
  )
}

// Painel read-only — a criação/edição de regra e o vínculo com Liga/Clube/
// Agente agora vivem só na tela de Regras (/admin/regras). Esse cadastro
// só mostra o que já está vinculado, pra quem tá editando saber de onde
// vem a taxa aplicada.
export function RegrasAplicadas({ entidadeTipo, entidadeId, settlementType, feeCashPct, feeMttPct }: Props) {
  const [regras, setRegras] = useState<RegraAplicada[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entidadeId) { setRegras([]); return }
    setLoading(true)
    getRegrasDaEntidade(entidadeTipo, entidadeId)
      .then(setRegras)
      .finally(() => setLoading(false))
  }, [entidadeTipo, entidadeId])

  const pctFixo: Record<string, number | null | undefined> = { fee_cash: feeCashPct, fee_mtt: feeMttPct }
  const camposSemTaxa = entidadeTipo === 'clube' && settlementType === 'taxa_dinamica'
    ? CAMPOS_CRITICOS.filter(({ campo }) => !regras.some(r => r.campo === campo) && !pctFixo[campo])
    : []

  return (
    <div className="space-y-2">
      {camposSemTaxa.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-alert/30 bg-alert/10 text-alert text-xs">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>
            {camposSemTaxa.map(c => c.label).join(' e ')} sem regra vinculada e sem % fixo definido na etapa Taxas —
            {camposSemTaxa.length > 1 ? ' esses rakes' : ' esse rake'} não vão gerar fee nenhuma, só parte do rake do clube estará sendo cobrada.
          </p>
        </div>
      )}
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
      ) : entidadeTipo === 'clube' ? (
        // Clube pode ter até 4 vínculos independentes (um por campo) — agrupa
        // pra ficar claro qual regra vale pra qual taxa.
        <div className="space-y-4">
          {(Object.keys(LABEL_CAMPO) as CampoClube[]).map(campo => {
            const doGrupo = regras.filter(r => r.campo === campo)
            if (doGrupo.length === 0) return null
            return (
              <div key={campo} className="space-y-2">
                <p className="text-xs font-semibold text-gold">{LABEL_CAMPO[campo]}</p>
                {doGrupo.map(r => <RegraCard key={r.regra_id} r={r} />)}
              </div>
            )
          })}
          {regras.some(r => !r.campo) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500">Sem campo definido</p>
              {regras.filter(r => !r.campo).map(r => <RegraCard key={r.regra_id} r={r} />)}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {regras.map(r => <RegraCard key={r.regra_id} r={r} />)}
        </div>
      )}
    </div>
  )
}

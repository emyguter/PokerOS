'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ListChecks, AlertTriangle } from 'lucide-react'
import type { EntidadeTipo, CampoClube } from '@/lib/types'
import { getRegrasDaEntidade, type RegraAplicada } from '@/lib/cadastro-api'
import { useI18n } from '@/lib/i18n'

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

function RegraCard({ r }: { r: RegraAplicada }) {
  const { t } = useI18n()
  const LABEL_TIPO: Record<EntidadeTipo, string> = {
    plataforma: t('regras_aplicadas.entidade_plataforma'),
    mega_liga: t('regras_aplicadas.entidade_mega_liga'),
    superliga: t('regras_aplicadas.entidade_superliga'),
    liga: t('regras_aplicadas.entidade_liga'),
    clube: t('regras_aplicadas.entidade_clube'),
    agente: t('regras_aplicadas.entidade_agente'),
    jogador: t('regras_aplicadas.entidade_jogador'),
  }
  return (
    <div className="p-3 bg-surface2 rounded-lg border border-white/10 space-y-2">
      <p className="text-xs text-gray-400">
        {r.de_nome && (
          <>{t('regras_aplicadas.vem_de')} <span className="text-gold font-medium">{LABEL_TIPO[r.de_tipo!]} {r.de_nome}</span>: </>
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
        <p className="text-xs text-gray-500 italic">{t('regras_aplicadas.sem_condicoes')}</p>
      )}
    </div>
  )
}

// Painel read-only — a criação/edição de regra e o vínculo com Liga/Clube/
// Agente agora vivem só na tela de Regras (/admin/regras). Esse cadastro
// só mostra o que já está vinculado, pra quem tá editando saber de onde
// vem a taxa aplicada.
export function RegrasAplicadas({ entidadeTipo, entidadeId, settlementType, feeCashPct, feeMttPct }: Props) {
  const { t } = useI18n()
  const CAMPOS_CRITICOS: { campo: CampoClube; label: string }[] = [
    { campo: 'fee_cash', label: t('regra_modal.campo_fee_cash') },
    { campo: 'fee_mtt', label: t('regra_modal.campo_fee_mtt') },
  ]
  const LABEL_CAMPO: Record<CampoClube, string> = {
    fee_mtt: t('regra_modal.campo_fee_mtt'), fee_cash: t('regra_modal.campo_fee_cash'), taxa_op: t('regra_modal.campo_taxa_op'), spinup: t('regra_modal.campo_spinup'), rake_total: t('regra_modal.campo_rake_total'), taxa_liga: t('regra_modal.campo_taxa_liga'),
  }
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
  // Regra vinculada no campo "Rake" (rake_total) serve de fallback pra Fee
  // Cash/Fee MTT em Taxa Dinâmica quando eles não têm regra própria (ver
  // lib/acertos-engine.ts) — então também conta como "tem taxa" aqui.
  const temRegraRakeTotal = regras.some(r => r.campo === 'rake_total')
  const camposSemTaxa = entidadeTipo === 'clube' && settlementType === 'taxa_dinamica'
    ? CAMPOS_CRITICOS.filter(({ campo }) => !regras.some(r => r.campo === campo) && !pctFixo[campo] && !temRegraRakeTotal)
    : []

  return (
    <div className="space-y-2">
      {camposSemTaxa.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-alert/30 bg-alert/10 text-alert text-xs">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>
            {t('regras_aplicadas.aviso_sem_taxa', {
              campos: camposSemTaxa.map(c => c.label).join(t('regras_aplicadas.juncao_e')),
              rakesTexto: camposSemTaxa.length > 1 ? t('regras_aplicadas.rakes_plural') : t('regras_aplicadas.rakes_singular'),
            })}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{t('regras_aplicadas.regras_aplicadas_titulo')}</p>
        <Link href="/admin/regras" className="flex items-center gap-1 text-xs text-gold hover:underline">
          <ListChecks size={12} />{t('regras_aplicadas.gerenciar_em_regras')}
        </Link>
      </div>

      {!entidadeId ? (
        <p className="text-xs text-gray-500 italic">{t('regras_aplicadas.salve_primeiro')}</p>
      ) : loading ? (
        <p className="text-xs text-gray-500">{t('common.carregando')}</p>
      ) : regras.length === 0 ? (
        <p className="text-xs text-gray-500 italic">{t('regras_aplicadas.nenhuma_regra')}</p>
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
              <p className="text-xs font-semibold text-gray-500">{t('regras_aplicadas.sem_campo_definido')}</p>
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

'use client'
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getLayoutDoClube, resolverLayout, calcularTotalAcerto, type CampoAcerto, type CampoResolvido } from '@/lib/relatorio-acerto'
import { getDividasAcertoDoClube, type ItemDividaAcerto } from '@/lib/dividas'

export interface AcertoCard {
  id: string
  club_id: string | null
  club_name: string
  club_external_id: string
  settlement_type: string
  taxa_tipo?: string
  valor_acerto: number
  rake_mtt: number
  rake_cash: number
  rake_total: number
  player_result: number
  fee_mtt_valor: number
  fee_cash_valor: number
  fee_operacional_valor: number
  fee_spinup_valor: number
  taxa_cash_pct_aplicada: number | null
  rebate_calculado: number
  bilhetes: number
  pendencias_antecipacao: number
  indicacao_valor: number
}

interface Props {
  acerto: AcertoCard
  ligaNome: string
  periodStart: string
  periodEnd: string
  onClose: () => void
}

interface ClubSettings {
  fee_mtt_pct: number | null
  taxa_op_pct: number | null
  taxa_op_ativo: boolean
  spinup_pct: number | null
  security: number | null
  wtr4_semanas_manual: number | null
}

interface LancamentoCard {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
}

const LABELS_LANCAMENTO: Record<string, string> = {
  bonus: 'Bônus',
  promocao: 'Promoção',
  caucao: 'Caução',
  pagamento: 'Pagamento',
  outro: 'Outro',
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (n: number | null) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatPeriodo(start: string, end: string) {
  if (!start) return '—'
  const s = new Date(start + 'T00:00:00')
  const e = end ? new Date(end + 'T00:00:00') : null
  const fmtD = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const fmtFull = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return e ? `${fmtD(s)} a ${fmtFull(e)}` : fmtFull(s)
}

function Linha({ label, value, editable, onCommit }: { label: string; value: number; editable?: boolean; onCommit?: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 text-sm">
      <span className="text-gray-400">{label}</span>
      {editable ? (
        <input
          type="number"
          step="any"
          defaultValue={value}
          onBlur={(e) => onCommit?.(Number(e.target.value) || 0)}
          className="w-28 text-right bg-surface border border-white/10 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-gold/50"
        />
      ) : (
        <span className="text-white font-medium">{fmt(value)}</span>
      )}
    </div>
  )
}

export function ClubAcertoCard({ acerto, ligaNome, periodStart, periodEnd, onClose }: Props) {
  const [club, setClub] = useState<ClubSettings | null>(null)
  const [wtr, setWtr] = useState<number | null>(null)
  const [lancamentos, setLancamentos] = useState<LancamentoCard[]>([])
  const [dividasItens, setDividasItens] = useState<ItemDividaAcerto[]>([])
  const [layout, setLayout] = useState<CampoResolvido[]>(() => resolverLayout(null))

  useEffect(() => {
    if (acerto.club_id) {
      supabase.from('clubs').select('fee_mtt_pct, taxa_op_pct, taxa_op_ativo, spinup_pct, security, wtr4_semanas_manual').eq('id', acerto.club_id).maybeSingle()
        .then(({ data }) => setClub(data))
    }
  }, [acerto.club_id])

  useEffect(() => {
    // Win to Rake das últimas 4 semanas: média de (Ganhos / Rake Total) dos
    // últimos 4 acertos desse clube, incluindo o período atual. Mesma regra
    // de prioridade do motor (lib/acertos-engine.ts): o WtR 4 Semanas manual
    // só entra como tapa-buraco enquanto não tem 4 acertos reais — assim o
    // card nunca mostra um número diferente do que decidiu a faixa de taxa.
    supabase
      .from('acertos')
      .select('player_result, rake_total, imports(period_start)')
      .eq('club_external_id', acerto.club_external_id)
      .order('imports(period_start)', { ascending: false })
      .limit(4)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as { player_result: number; rake_total: number }[]
        const validos = rows.filter((r) => r.rake_total)
        if (validos.length < 4 && club?.wtr4_semanas_manual != null) { setWtr(club.wtr4_semanas_manual); return }
        if (validos.length === 0) { setWtr(null); return }
        const media = validos.reduce((s, r) => s + r.player_result / r.rake_total, 0) / validos.length
        setWtr(media)
      })
  }, [acerto.club_external_id, club])

  useEffect(() => {
    // Bônus/promoção/pagamento lançados na tela de Lançamento, no mesmo
    // período desse acerto — pra fechar o card "completo" que o Cássio
    // pediu, não só o cálculo automático de rake. Caução fica de fora de
    // propósito: vive só no extrato dela mesma (e alimenta o Stoploss) —
    // misturar com o Acerto semanal de rake bagunça as duas contas.
    // Antecipação também fica de fora: já entra separado na linha
    // "Pendências / Antecipação" (soma das Antecipações conciliadas) —
    // contar aqui também dobraria o valor. Financeiro (origem "genia")
    // também fica de fora — é só a conferência interna do que o Suporte já
    // lançou (ver Conciliação); contar os dois dobra o valor (mesma regra do
    // ExtratoView e da AcertosView).
    if (!acerto.club_id || !periodStart) { setLancamentos([]); return }
    supabase
      .from('lancamentos')
      .select('id, tipo, natureza, valor, descricao')
      .eq('clube_id', acerto.club_id)
      .in('origem', ['suporte', 'seguranca'])
      .neq('tipo', 'caucao')
      .neq('tipo', 'antecipacao')
      .gte('data_lancamento', periodStart)
      .lte('data_lancamento', periodEnd || periodStart)
      .then(({ data }) => setLancamentos(data ?? []))
  }, [acerto.club_id, periodStart, periodEnd])

  useEffect(() => {
    // Parcela de Acordo em aberto (ou dívida Simples ativa) desse clube
    // também reduz o Acerto — continua entrando toda semana até o Suporte
    // marcar como paga em Dívidas e Acordos.
    if (!acerto.club_id || !periodStart) { setDividasItens([]); return }
    getDividasAcertoDoClube(acerto.club_id, periodEnd || periodStart).then(setDividasItens)
  }, [acerto.club_id, periodStart, periodEnd])

  useEffect(() => {
    // Regra de Layout do Acerto vinculada ao clube (se tiver) — decide só
    // quais linhas aparecem e em que ordem. Sem regra vinculada, fica no
    // padrão que o card sempre teve (já é o valor inicial do state).
    if (!acerto.club_id) return
    getLayoutDoClube(acerto.club_id).then(setLayout)
  }, [acerto.club_id])

  const security = club?.security ?? 0
  const rebateDisplay = -acerto.rebate_calculado
  const lancamentosLiquido = lancamentos.reduce((s, l) => s + (l.natureza === 'credito' ? l.valor : -l.valor), 0)
  const dividasTotal = dividasItens.reduce((s, d) => s + d.valor, 0)
  // Base já vem do motor (acerto.valor_acerto — certo pra cada
  // settlement_type, rebate já embutido quando é o caso) + tudo o mais que
  // compõe o Acerto de verdade. Nada pode ficar de fora (confirmado pelo
  // Cássio) — mesma fórmula usada na lista de Acertos e no Controle de
  // Pagamentos, pra nunca dar número diferente em lugares diferentes.
  const total = calcularTotalAcerto(acerto.valor_acerto, {
    bilhetes: acerto.bilhetes,
    pendenciasAntecipacao: acerto.pendencias_antecipacao,
    security,
    indicacaoValor: acerto.indicacao_valor,
    lancamentosLiquido,
    dividasTotal,
  })

  // O layout (Regra vinculada ao clube) só decide QUAIS linhas aparecem e em
  // que ordem — o Total sempre soma tudo, igual já funciona no Liberar para
  // Acerto: personalizar o card não pode acidentalmente mudar quanto o
  // clube recebe.
  function renderCampo(campo: CampoAcerto) {
    switch (campo) {
      case 'semana':
        return (
          <div key={campo} className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">Semana</span>
            <span className="text-white font-medium">{formatPeriodo(periodStart, periodEnd)}</span>
          </div>
        )
      case 'clube':
        return (
          <div key={campo} className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">Club</span>
            <span className="text-gold font-medium">{acerto.club_name}</span>
          </div>
        )
      case 'taxa_mtt':
        return <Linha key={campo} label={`Taxa Atual - MTT (${fmtPct(club?.fee_mtt_pct ?? null)}%)`} value={-acerto.fee_mtt_valor} />
      case 'wtr4':
        return (
          <div key={campo} className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">WtR 4 Semanas</span>
            <span className="text-white font-medium">{wtr === null ? '—' : fmt(wtr)}</span>
          </div>
        )
      case 'taxa_cash':
        return <Linha key={campo} label={`Taxa Dinâmica - Cash (${fmtPct(acerto.taxa_cash_pct_aplicada)}%)`} value={-acerto.fee_cash_valor} />
      case 'rake_total':
        return <Linha key={campo} label="Rake Total" value={acerto.rake_total} />
      case 'rake_mtt':
        return <Linha key={campo} label="Rake MTT" value={acerto.rake_mtt} />
      case 'rake_cash':
        return <Linha key={campo} label="Rake Cash" value={acerto.rake_cash} />
      case 'ganhos':
        return <Linha key={campo} label="Ganhos/Perdas" value={acerto.player_result} />
      case 'taxa_operacional':
        return <Linha key={campo} label={club?.taxa_op_ativo === false ? 'Taxa Operacional (desativada)' : `Taxa Operacional (${fmtPct(club?.taxa_op_pct ?? null)}%)`} value={-acerto.fee_operacional_valor} />
      case 'spinup':
        return <Linha key={campo} label={`SpinUp Lucro (${fmtPct(club?.spinup_pct ?? null)}%)`} value={-acerto.fee_spinup_valor} />
      case 'bilhetes':
        return <Linha key={campo} label="Bilhetes" value={acerto.bilhetes} />
      case 'pendencias':
        return <Linha key={campo} label="Pendências / Antecipação" value={acerto.pendencias_antecipacao} />
      case 'seguranca':
        return <Linha key={campo} label="Segurança" value={security} />
      case 'rebate':
        return <Linha key={campo} label="Rebate" value={rebateDisplay} />
      case 'indicacao':
        return acerto.indicacao_valor !== 0 ? <Linha key={campo} label="Indicação" value={acerto.indicacao_valor} /> : null
      case 'lancamentos_periodo':
        return lancamentos.length > 0 ? (
          <div key={campo} className="py-1">
            <p className="px-3 pt-1.5 pb-0.5 text-[11px] uppercase tracking-wide text-gray-500">Lançamentos do período</p>
            {lancamentos.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-1 px-3 text-sm">
                <span className="text-gray-400">
                  {LABELS_LANCAMENTO[l.tipo] ?? l.tipo}
                  {l.descricao && <span className="text-gray-600"> · {l.descricao}</span>}
                </span>
                <span className={l.natureza === 'credito' ? 'text-success font-medium' : 'text-alert font-medium'}>
                  {l.natureza === 'credito' ? '+' : '−'}{fmt(l.valor)}
                </span>
              </div>
            ))}
          </div>
        ) : null
      case 'dividas_acordos':
        return dividasItens.length > 0 ? (
          <div key={campo} className="py-1">
            <p className="px-3 pt-1.5 pb-0.5 text-[11px] uppercase tracking-wide text-gray-500">Dívidas / Acordos</p>
            {dividasItens.map((d, i) => (
              <div key={i} className="flex items-center justify-between py-1 px-3 text-sm">
                <span className="text-gray-400">{d.descricao}</span>
                <span className="text-alert font-medium">−{fmt(d.valor)}</span>
              </div>
            ))}
          </div>
        ) : null
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-surface border border-gold/30 rounded-2xl w-full max-w-md mx-4 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="text-center flex-1">
            <p className="text-gold font-display font-semibold text-base leading-tight">{ligaNome}</p>
            <p className="text-xs text-gray-400 tracking-wide mt-0.5">COMMON SETTLEMENT / ACERTO GERAL</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-white/10">
          {layout.filter((c) => c.visivel).map((c) => renderCampo(c.campo))}

          <div className="flex items-center justify-between py-3 px-3 bg-surface2">
            <span className="text-white font-semibold text-sm">Total</span>
            <span className={`font-bold text-base ${total >= 0 ? 'text-success' : 'text-alert'}`}>{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

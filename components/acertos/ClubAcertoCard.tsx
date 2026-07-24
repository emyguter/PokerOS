'use client'
import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface AcertoCard {
  id: string
  club_id: string | null
  club_name: string
  club_external_id: string
  settlement_type: string
  taxa_tipo?: string
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
  taxa_aa_home_game: number
}

interface Props {
  acerto: AcertoCard
  ligaNome: string
  periodStart: string
  periodEnd: string
  onClose: () => void
  onSaved: () => void
}

interface ClubSettings {
  fee_mtt_pct: number | null
  taxa_op_pct: number | null
  spinup_pct: number | null
  security: number | null
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

export function ClubAcertoCard({ acerto, ligaNome, periodStart, periodEnd, onClose, onSaved }: Props) {
  const [club, setClub] = useState<ClubSettings | null>(null)
  const [wtr, setWtr] = useState<number | null>(null)
  const [bilhetes, setBilhetes] = useState(acerto.bilhetes ?? 0)
  const [pendencias, setPendencias] = useState(acerto.pendencias_antecipacao ?? 0)
  const [taxaAaHomeGame, setTaxaAaHomeGame] = useState(acerto.taxa_aa_home_game ?? 0)
  const [saving, setSaving] = useState(false)
  const [lancamentos, setLancamentos] = useState<LancamentoCard[]>([])

  useEffect(() => {
    if (acerto.club_id) {
      supabase.from('clubs').select('fee_mtt_pct, taxa_op_pct, spinup_pct, security').eq('id', acerto.club_id).maybeSingle()
        .then(({ data }) => setClub(data))
    }
  }, [acerto.club_id])

  useEffect(() => {
    // Win to Rake das últimas 4 semanas: média de (Ganhos / Rake Total) dos
    // últimos 4 acertos desse clube, incluindo o período atual.
    supabase
      .from('acertos')
      .select('player_result, rake_total, imports(period_start)')
      .eq('club_external_id', acerto.club_external_id)
      .order('imports(period_start)', { ascending: false })
      .limit(4)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as { player_result: number; rake_total: number }[]
        const validos = rows.filter((r) => r.rake_total)
        if (validos.length === 0) { setWtr(null); return }
        const media = validos.reduce((s, r) => s + r.player_result / r.rake_total, 0) / validos.length
        setWtr(media * 100)
      })
  }, [acerto.club_external_id])

  useEffect(() => {
    // Bônus/promoção/caução/pagamento lançados na tela de Lançamento, no
    // mesmo período desse acerto — pra fechar o card "completo" que o
    // Cássio pediu, não só o cálculo automático de rake.
    if (!acerto.club_id || !periodStart) { setLancamentos([]); return }
    supabase
      .from('lancamentos')
      .select('id, tipo, natureza, valor, descricao')
      .eq('clube_id', acerto.club_id)
      .gte('data_lancamento', periodStart)
      .lte('data_lancamento', periodEnd || periodStart)
      .then(({ data }) => setLancamentos(data ?? []))
  }, [acerto.club_id, periodStart, periodEnd])

  const salvarExtras = useCallback(async (campo: 'bilhetes' | 'pendencias_antecipacao' | 'taxa_aa_home_game', valor: number) => {
    setSaving(true)
    await supabase.from('acertos').update({ [campo]: valor }).eq('id', acerto.id)
    setSaving(false)
    onSaved()
  }, [acerto.id, onSaved])

  const security = club?.security ?? 0
  const rebateDisplay = -acerto.rebate_calculado
  const lancamentosLiquido = lancamentos.reduce((s, l) => s + (l.natureza === 'credito' ? l.valor : -l.valor), 0)
  const total =
    acerto.rake_total + acerto.player_result -
    acerto.fee_mtt_valor - acerto.fee_cash_valor - acerto.fee_spinup_valor - acerto.fee_operacional_valor +
    bilhetes + pendencias + security + rebateDisplay + taxaAaHomeGame + lancamentosLiquido

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-gold/30 rounded-2xl w-full max-w-md mx-4 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="text-center flex-1">
            <p className="text-gold font-display font-semibold text-base leading-tight">{ligaNome}</p>
            <p className="text-xs text-gray-400 tracking-wide mt-0.5">COMMON SETTLEMENT / ACERTO GERAL</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-white/10">
          <div className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">Semana</span>
            <span className="text-white font-medium">{formatPeriodo(periodStart, periodEnd)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">Club</span>
            <span className="text-gold font-medium">{acerto.club_name}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">Taxa Atual - MTT%</span>
            <span className="text-white font-medium">{fmtPct(club?.fee_mtt_pct ?? null)}%</span>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">WtR 4 Semanas</span>
            <span className="text-white font-medium">{wtr === null ? '—' : `${fmtPct(wtr)}%`}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">Taxa Dinâmica - Cash%</span>
            <span className="text-white font-medium">{fmtPct(acerto.taxa_cash_pct_aplicada)}%</span>
          </div>

          <Linha label="Rake Total" value={acerto.rake_total} />
          <Linha label="Rake MTT" value={acerto.rake_mtt} />
          <Linha label="Rake Cash" value={acerto.rake_cash} />
          <Linha label="Ganhos/Perdas" value={acerto.player_result} />

          <Linha label={`Taxa Atual - MTT (${fmtPct(club?.fee_mtt_pct ?? null)}%)`} value={-acerto.fee_mtt_valor} />
          <Linha label={`Taxa Dinâmica - Cash (${fmtPct(acerto.taxa_cash_pct_aplicada)}%)`} value={-acerto.fee_cash_valor} />
          <Linha label={`SpinUp Lucro (${fmtPct(club?.spinup_pct ?? null)}%)`} value={-acerto.fee_spinup_valor} />
          <Linha label={`Taxa Operacional (${fmtPct(club?.taxa_op_pct ?? null)}%)`} value={-acerto.fee_operacional_valor} />
          <Linha label="Bilhetes" value={bilhetes} editable onCommit={(v) => { setBilhetes(v); salvarExtras('bilhetes', v) }} />
          <Linha label="Pendências / Antecipação" value={pendencias} editable onCommit={(v) => { setPendencias(v); salvarExtras('pendencias_antecipacao', v) }} />
          <Linha label="Security" value={security} />
          <Linha label="Rebate" value={rebateDisplay} />
          <Linha label="Taxa A-A HOME GAME" value={taxaAaHomeGame} editable onCommit={(v) => { setTaxaAaHomeGame(v); salvarExtras('taxa_aa_home_game', v) }} />

          {lancamentos.length > 0 && (
            <div className="py-1">
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
          )}

          <div className="flex items-center justify-between py-3 px-3 bg-surface2">
            <span className="text-white font-semibold text-sm">Total</span>
            <span className={`font-bold text-base ${total >= 0 ? 'text-success' : 'text-alert'}`}>{fmt(total)}</span>
          </div>
        </div>

        {saving && <div className="px-5 py-2 text-xs text-gray-500 border-t border-white/10">Salvando...</div>}
      </div>
    </div>
  )
}

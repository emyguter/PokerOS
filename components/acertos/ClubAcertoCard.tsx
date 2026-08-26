'use client'
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getLayoutDoClube, resolverLayout, calcularTotalAcerto, corrigirValorCrypto, type CampoAcerto, type CampoResolvido } from '@/lib/relatorio-acerto'
import { getDividasAcertoDoClube, type ItemDividaAcerto } from '@/lib/dividas'
import { getVinculosAcerto, getIndicacoes } from '@/lib/cadastro-api'

export interface AcertoCard {
  id: string
  club_id: string | null
  club_name: string
  club_external_id: string
  settlement_type: string
  valor_acerto: number
  rake_mtt: number
  rake_cash: number
  rake_total: number
  player_result: number
  fee_calculado: number
  fee_mtt_valor: number
  fee_cash_valor: number
  fee_operacional_valor: number
  fee_spinup_valor: number
  taxa_liga_valor: number
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
  crypto_rebate_pct: number | null
  leagues: { taxa_app_pct: number | null } | null
}

interface LancamentoCard {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
}

// 1 linha do grupo de Clube Vinculado (ver lib/cadastro-api.ts) — o Acerto
// desse MESMO período de cada clube que aponta pra (ou é) a mesma âncora.
interface AcertoGrupoRow {
  club_id: string
  club_name: string
  rake_mtt: number
  rake_cash: number
  rake_total: number
  player_result: number
  fee_calculado: number
  fee_mtt_valor: number
  fee_cash_valor: number
  fee_operacional_valor: number
  fee_spinup_valor: number
  taxa_liga_valor: number
  bilhetes: number
  pendencias_antecipacao: number
  indicacao_valor: number
  rebate_calculado: number
  valor_acerto: number
}

interface ExtrasClube {
  security: number
  lancamentos: LancamentoCard[]
  dividasItens: ItemDividaAcerto[]
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

async function buscarExtrasClube(clubeId: string, periodStart: string, periodEnd: string): Promise<ExtrasClube> {
  const [{ data: clubeData }, { data: lancData }, dividasItens] = await Promise.all([
    supabase.from('clubs').select('security').eq('id', clubeId).maybeSingle(),
    supabase
      .from('lancamentos')
      .select('id, tipo, natureza, valor, descricao')
      .eq('clube_id', clubeId)
      .in('origem', ['suporte', 'seguranca'])
      .neq('tipo', 'caucao')
      .neq('tipo', 'antecipacao')
      .gte('data_lancamento', periodStart)
      .lte('data_lancamento', periodEnd || periodStart),
    getDividasAcertoDoClube(clubeId, periodEnd || periodStart),
  ])
  return {
    security: (clubeData?.security as number | null) ?? 0,
    lancamentos: (lancData ?? []) as LancamentoCard[],
    dividasItens,
  }
}

export function ClubAcertoCard({ acerto, ligaNome, periodStart, periodEnd, onClose }: Props) {
  const [club, setClub] = useState<ClubSettings | null>(null)
  const [wtr, setWtr] = useState<number | null>(null)
  const [lancamentos, setLancamentos] = useState<LancamentoCard[]>([])
  const [dividasItens, setDividasItens] = useState<ItemDividaAcerto[]>([])
  const [layout, setLayout] = useState<CampoResolvido[]>(() => resolverLayout(null))
  // Clube Vinculado (mesmo clube em outra plataforma, ex: ClubGG + Sul HG) —
  // esse card ("Common Settlement / Acerto Geral") é o único lugar que soma
  // os dois, pedido explícito do Cássio (o Resumo de Acertos continua
  // mostrando cada plataforma separada). `outrosMembros`: quem mais tá no
  // mesmo grupo, sem o clube que abriu o card.
  const [outrosMembros, setOutrosMembros] = useState<{ id: string; nome: string }[]>([])
  const [acertosGrupo, setAcertosGrupo] = useState<AcertoGrupoRow[]>([])
  const [extrasPorClube, setExtrasPorClube] = useState<Map<string, ExtrasClube>>(new Map())
  const [indicacaoPct, setIndicacaoPct] = useState(0)

  useEffect(() => {
    if (acerto.club_id) {
      supabase.from('clubs').select('fee_mtt_pct, taxa_op_pct, taxa_op_ativo, spinup_pct, security, wtr4_semanas_manual, crypto_rebate_pct, leagues(taxa_app_pct)').eq('id', acerto.club_id).maybeSingle()
        .then(({ data }) => setClub(data as unknown as ClubSettings))
    }
  }, [acerto.club_id])

  useEffect(() => {
    // Win to Rake das últimas 4 semanas: média de (Ganhos / Rake Total) dos
    // últimos 4 acertos desse clube, incluindo o período atual. Mesma regra
    // de prioridade do motor (lib/acertos-engine.ts): o WtR 4 Semanas manual
    // só entra como tapa-buraco enquanto não tem 4 acertos reais — assim o
    // card nunca mostra um número diferente do que decidiu a faixa de taxa.
    // Não soma com o clube vinculado — WtR é uma razão, não um valor em R$,
    // e cada plataforma tem o rake dela própria.
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
        // Razão das somas (mesma fórmula de lib/acertos-engine.ts): soma
        // Ganhos e soma Rake das semanas primeiro, divide os totais uma vez
        // só — não é a média de cada razão semanal.
        const somaGanhos = validos.reduce((s, r) => s + r.player_result, 0)
        const somaRake = validos.reduce((s, r) => s + r.rake_total, 0)
        setWtr(somaRake ? somaGanhos / somaRake : null)
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

  useEffect(() => {
    if (!acerto.club_id) { setOutrosMembros([]); return }
    getVinculosAcerto(acerto.club_id).then(setOutrosMembros).catch(() => setOutrosMembros([]))
  }, [acerto.club_id])

  useEffect(() => {
    // % pra exibir na linha "Indicação (X%)" — o valor em R$ (indicacaoValor)
    // é calculado sobre o rake do clube indicado, não desse clube, então não
    // dá pra reconstruir a % dividindo pelo rake daqui. Busca direto o(s)
    // vínculo(s) cadastrados hoje e soma — mesma simplificação já usada nos
    // outros % do card (Taxa MTT/Cash etc.): mostra a config atual, não a
    // histórica de quando o Acerto foi calculado.
    if (!acerto.club_id) { setIndicacaoPct(0); return }
    getIndicacoes(acerto.club_id)
      .then((linhas) => setIndicacaoPct(linhas.reduce((s, l) => s + l.taxaIndicacaoPct, 0)))
      .catch(() => setIndicacaoPct(0))
  }, [acerto.club_id])

  const idsGrupo = acerto.club_id && outrosMembros.length > 0 ? [acerto.club_id, ...outrosMembros.map((m) => m.id)] : []
  const idsGrupoChave = idsGrupo.join(',')

  useEffect(() => {
    if (idsGrupo.length === 0 || !periodEnd) { setAcertosGrupo([]); setExtrasPorClube(new Map()); return }
    let cancelado = false
    ;(async () => {
      const { data: importsData } = await supabase.from('imports').select('id').eq('period_end', periodEnd)
      const importIds = (importsData ?? []).map((i) => i.id as string)
      if (importIds.length === 0) { if (!cancelado) { setAcertosGrupo([]); setExtrasPorClube(new Map()) }; return }
      const { data } = await supabase
        .from('acertos')
        .select('club_id, club_name, rake_mtt, rake_cash, rake_total, player_result, fee_calculado, fee_mtt_valor, fee_cash_valor, fee_operacional_valor, fee_spinup_valor, taxa_liga_valor, bilhetes, pendencias_antecipacao, indicacao_valor, rebate_calculado, valor_acerto')
        .in('club_id', idsGrupo)
        .in('import_id', importIds)
      const linhas = (data ?? []) as AcertoGrupoRow[]
      const extras = await Promise.all(linhas.map(async (r) => [r.club_id, await buscarExtrasClube(r.club_id, periodStart, periodEnd)] as const))
      if (cancelado) return
      setAcertosGrupo(linhas)
      setExtrasPorClube(new Map(extras))
    })()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsGrupoChave, periodStart, periodEnd])

  // Card "agrupa" sempre que o clube TEM vínculo cadastrado — mesmo que o
  // outro membro não tenha Acerto nessa semana (não jogou), ele ainda
  // aparece na quebra "Acerto por clube vinculado" com R$0, em vez de sumir
  // da tela (pedido do Cássio, achado no caso PIXGAME/Liga Particular +
  // PIXGAME/Orion). Os somatórios (rakeMtt, feeCalculadoValor etc. abaixo)
  // continuam corretos: somam só as linhas que de fato existem em
  // acertosGrupo, então um membro sem Acerto simplesmente não soma nada.
  const agrupado = outrosMembros.length > 0

  const somaGrupo = (campo: keyof Omit<AcertoGrupoRow, 'club_id' | 'club_name'>) =>
    acertosGrupo.reduce((s, r) => s + (r[campo] ?? 0), 0)

  const rakeMtt = agrupado ? somaGrupo('rake_mtt') : acerto.rake_mtt
  const rakeCash = agrupado ? somaGrupo('rake_cash') : acerto.rake_cash
  const rakeTotal = agrupado ? somaGrupo('rake_total') : acerto.rake_total
  const ganhos = agrupado ? somaGrupo('player_result') : acerto.player_result
  const feeCalculadoValor = agrupado ? somaGrupo('fee_calculado') : acerto.fee_calculado
  const feeMttValor = agrupado ? somaGrupo('fee_mtt_valor') : acerto.fee_mtt_valor
  const feeCashValor = agrupado ? somaGrupo('fee_cash_valor') : acerto.fee_cash_valor
  const feeOperacionalValor = agrupado ? somaGrupo('fee_operacional_valor') : acerto.fee_operacional_valor
  const feeSpinupValor = agrupado ? somaGrupo('fee_spinup_valor') : acerto.fee_spinup_valor
  const taxaLigaValor = agrupado ? somaGrupo('taxa_liga_valor') : acerto.taxa_liga_valor
  const bilhetesValor = agrupado ? somaGrupo('bilhetes') : acerto.bilhetes
  const pendenciasValor = agrupado ? somaGrupo('pendencias_antecipacao') : acerto.pendencias_antecipacao
  const indicacaoValor = agrupado ? somaGrupo('indicacao_valor') : acerto.indicacao_valor
  const rebateCalculado = agrupado ? somaGrupo('rebate_calculado') : acerto.rebate_calculado
  const clubNameDisplay = agrupado ? [...new Set(acertosGrupo.map((r) => r.club_name))].join(' + ') : acerto.club_name

  const lancamentosDisplay = agrupado
    ? acertosGrupo.flatMap((r) => extrasPorClube.get(r.club_id)?.lancamentos ?? [])
    : lancamentos
  const dividasDisplay = agrupado
    ? acertosGrupo.flatMap((r) => extrasPorClube.get(r.club_id)?.dividasItens ?? [])
    : dividasItens
  const security = agrupado
    ? acertosGrupo.reduce((s, r) => s + (extrasPorClube.get(r.club_id)?.security ?? 0), 0)
    : club?.security ?? 0

  const rebateDisplay = -rebateCalculado
  const lancamentosLiquido = lancamentosDisplay.reduce((s, l) => s + (l.natureza === 'credito' ? l.valor : -l.valor), 0)
  const dividasTotal = dividasDisplay.reduce((s, d) => s + d.valor, 0)

  // Cada clube do grupo tem seu próprio "Acerto R$" (o total que ele sozinho
  // teria) — mostrado como quebra logo acima do Total combinado, pedido do
  // Cássio (mesmo formato da planilha de referência: "Acerto R$ ClubGG" /
  // "Acerto R$ Sul HG"). A soma dos dois bate exatamente com o Total do card.
  // Sempre lista TODOS os membros do vínculo (o clube do card + outrosMembros),
  // não só os que têm linha em acertosGrupo — membro sem Acerto nessa semana
  // entra com total R$0 em vez de sumir da quebra.
  const totaisPorMembro = agrupado
    ? [{ id: acerto.club_id as string, nomeCadastro: acerto.club_name }, ...outrosMembros.map((m) => ({ id: m.id, nomeCadastro: m.nome }))].map(({ id, nomeCadastro }) => {
        const r = acertosGrupo.find((row) => row.club_id === id)
        if (!r) return { nome: nomeCadastro, total: 0 }
        const extras = extrasPorClube.get(r.club_id)
        const lancLiquido = (extras?.lancamentos ?? []).reduce((s, l) => s + (l.natureza === 'credito' ? l.valor : -l.valor), 0)
        const dividasT = (extras?.dividasItens ?? []).reduce((s, d) => s + d.valor, 0)
        return {
          nome: r.club_name,
          total: calcularTotalAcerto(r.valor_acerto, {
            bilhetes: r.bilhetes,
            pendenciasAntecipacao: r.pendencias_antecipacao,
            security: extras?.security ?? 0,
            indicacaoValor: r.indicacao_valor,
            lancamentosLiquido: lancLiquido,
            dividasTotal: dividasT,
          }),
        }
      })
    : []

  // Base já vem do motor (acerto.valor_acerto — certo pra cada
  // settlement_type, rebate já embutido quando é o caso) + tudo o mais que
  // compõe o Acerto de verdade. Nada pode ficar de fora (confirmado pelo
  // Cássio) — mesma fórmula usada na lista de Acertos e no Controle de
  // Pagamentos, pra nunca dar número diferente em lugares diferentes.
  // Agrupado: soma os totais individuais de cada clube do grupo (dá o mesmo
  // resultado que somar tudo direto, já que calcularTotalAcerto é linear).
  const total = agrupado
    ? totaisPorMembro.reduce((s, m) => s + m.total, 0)
    : calcularTotalAcerto(acerto.valor_acerto, {
        bilhetes: acerto.bilhetes,
        pendenciasAntecipacao: acerto.pendencias_antecipacao,
        security,
        indicacaoValor: acerto.indicacao_valor,
        lancamentosLiquido,
        dividasTotal,
      })

  // Crypto Rebate NÃO muda o Total guardado do Acerto — é só uma segunda
  // exibição embaixo dele (confirmado pelo Cássio): "Acerto com Crypto" é o
  // Total corrigido pela mesma fórmula do "Total Crypto Rebate"/"Pagar com
  // Crypto" (corrigirValorCrypto: valor ÷ (1 + %)), e "Desconto" é a
  // diferença entre os dois. Só aparece quando o clube tem % de Crypto
  // Rebate cadastrado — qualquer tipo de cobrança, não só Weekly USD.
  const totalComCrypto = club?.crypto_rebate_pct ? corrigirValorCrypto(total, club.crypto_rebate_pct) : null
  const descontoCrypto = totalComCrypto != null ? total - totalComCrypto : null

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
            <span className="text-gold font-medium">{clubNameDisplay}</span>
          </div>
        )
      case 'taxa_mtt':
        return <Linha key={campo} label={`Taxa MTT (${fmtPct(club?.fee_mtt_pct ?? null)}%)`} value={-feeMttValor} />
      case 'wtr4':
        return (
          <div key={campo} className="flex items-center justify-between py-1.5 px-3 text-sm">
            <span className="text-gray-400">WtR 4 Semanas</span>
            <span className="text-white font-medium">{wtr === null ? '—' : fmt(wtr)}</span>
          </div>
        )
      case 'taxa_cash':
        return <Linha key={campo} label={`Taxa Cash (${fmtPct(acerto.taxa_cash_pct_aplicada)}%)`} value={-feeCashValor} />
      case 'rake_total':
        return <Linha key={campo} label="Rake Total" value={rakeTotal} />
      case 'rake_mtt':
        return <Linha key={campo} label="Rake MTT" value={rakeMtt} />
      case 'rake_cash':
        return <Linha key={campo} label="Rake Cash" value={rakeCash} />
      case 'ganhos':
        return <Linha key={campo} label="Ganhos/Perdas" value={ganhos} />
      case 'taxa_operacional':
        return <Linha key={campo} label={club?.taxa_op_ativo === false ? 'Taxa Operacional (desativada)' : `Taxa Operacional (${fmtPct(club?.taxa_op_pct ?? null)}%)`} value={-feeOperacionalValor} />
      case 'spinup':
        return <Linha key={campo} label={`SpinUp Rake (${fmtPct(club?.spinup_pct ?? null)}%)`} value={-feeSpinupValor} />
      case 'taxa_liga': {
        // Taxa da Liga: cadastro/Regra da própria Liga manda quando tiver
        // algo configurado ali (taxaLigaValor != 0). Sem nada configurado na
        // Liga, cai pra Regra vinculada ao clube (fee_calculado) — pra
        // clubes sem Fee MTT/Cash (taxa_fixa_variavel/weekly_usd) é a única
        // taxa que existe, e conta como Taxa da Liga aqui. Em taxa_dinamica
        // nunca cai nesse fallback — já vem itemizado em Taxa MTT/Cash/
        // Operacional/SpinUp, e a Liga continua sendo uma camada à parte.
        // Subtrai a Taxa Operacional do fallback — ela já é uma linha própria
        // do card (case 'taxa_operacional' acima), então feeCalculadoValor
        // sozinho contava ela duas vezes (achado no caso AK AMAKHA club 2:
        // 19% mostrado, mas só 10% era taxa de verdade — os outros 9% já
        // apareciam de novo na linha de Taxa Operacional).
        const valorTaxaLiga = taxaLigaValor !== 0 || acerto.settlement_type === 'taxa_dinamica' ? taxaLigaValor : feeCalculadoValor - feeOperacionalValor
        const pct = rakeTotal > 0 ? (valorTaxaLiga / rakeTotal) * 100 : 0
        return <Linha key={campo} label={`Taxa da Liga (${fmtPct(pct)}%)`} value={-valorTaxaLiga} />
      }
      case 'bilhetes':
        return <Linha key={campo} label="Bilhetes" value={bilhetesValor} />
      case 'pendencias':
        return <Linha key={campo} label="Pendências / Antecipação" value={pendenciasValor} />
      case 'seguranca':
        return <Linha key={campo} label="Segurança" value={security} />
      case 'rebate':
        return <Linha key={campo} label="Rebate" value={rebateDisplay} />
      case 'indicacao': {
        if (indicacaoValor === 0) return null
        // O valor em R$ vem pronto do Acerto (soma de cada indicação × rake
        // do respectivo clube indicado, ver calcularIndicacao) — o % exibido
        // é o cadastrado hoje nos vínculos desse clube (indicacaoPct),
        // buscado à parte, já que não dá mais pra reconstruir a % dividindo
        // o valor pelo rake daqui (a base agora é o rake do indicado).
        return <Linha key={campo} label={`Indicação (${fmtPct(indicacaoPct)}%)`} value={indicacaoValor} />
      }
      case 'lancamentos_periodo':
        return lancamentosDisplay.length > 0 ? (
          <div key={campo} className="py-1">
            <p className="px-3 pt-1.5 pb-0.5 text-[11px] uppercase tracking-wide text-gray-500">Lançamentos do período</p>
            {lancamentosDisplay.map((l) => (
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
        return dividasDisplay.length > 0 ? (
          <div key={campo} className="py-1">
            <p className="px-3 pt-1.5 pb-0.5 text-[11px] uppercase tracking-wide text-gray-500">Dívidas / Acordos</p>
            {dividasDisplay.map((d, i) => (
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

          {agrupado && (
            <div className="py-1">
              <p className="px-3 pt-1.5 pb-0.5 text-[11px] uppercase tracking-wide text-gray-500">Acerto por clube vinculado</p>
              {totaisPorMembro.map((m) => (
                <div key={m.nome} className="flex items-center justify-between py-1 px-3 text-sm">
                  <span className="text-gray-400">Acerto R$ {m.nome}</span>
                  <span className="text-white font-medium">{fmt(m.total)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between py-3 px-3 bg-surface2">
            <span className="text-white font-semibold text-sm">Total</span>
            <span className={`font-bold text-base ${total >= 0 ? 'text-success' : 'text-alert'}`}>{fmt(total)}</span>
          </div>

          {totalComCrypto != null && descontoCrypto != null && (
            <>
              <div className="flex items-center justify-between py-2 px-3">
                <span className="text-gray-400 text-sm">Acerto com Crypto</span>
                <span className={`font-semibold text-sm ${totalComCrypto >= 0 ? 'text-success' : 'text-alert'}`}>{fmt(totalComCrypto)}</span>
              </div>
              <div className="flex items-center justify-between py-2 px-3">
                <span className="text-gray-400 text-sm">Desconto ({fmtPct(club?.crypto_rebate_pct ?? null)}%)</span>
                <span className="text-gray-400 text-sm">{fmt(descontoCrypto)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

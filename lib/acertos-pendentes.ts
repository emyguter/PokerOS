import { supabase } from './supabase'
import { buscarImportsComAcerto, buscarPagamentosPorImport } from './pagamentos'

export type StatusStoploss = 'ativo' | '50%' | 'bloqueado'

export interface LinhaAcertoPendenteSemana {
  clubId: string
  clubExternalId: string
  clubName: string
  status: StatusStoploss
  acerto: number
  pago: number
  diferenca: number
}

// Bloqueado tem prioridade sobre 50% (um clube pode ter os dois marcados ao
// mesmo tempo — o mais grave é o que aparece).
async function statusStoplossPorClube(clubIds: string[]): Promise<Map<string, StatusStoploss>> {
  const mapa = new Map<string, StatusStoploss>()
  if (clubIds.length === 0) return mapa
  const { data } = await supabase.from('clubs').select('id, bloqueado, corte_50_ativo').in('id', clubIds)
  for (const c of (data ?? []) as { id: string; bloqueado: boolean; corte_50_ativo: boolean }[]) {
    mapa.set(c.id, c.bloqueado ? 'bloqueado' : c.corte_50_ativo ? '50%' : 'ativo')
  }
  return mapa
}

// "Acertos Pendentes da Semana": Acerto da semana MAIS RECENTE já calculada
// que o clube ainda não pagou (ou pagou só parte) — mesma fonte de verdade
// do Controle de Pagamentos (lib/pagamentos.ts), só filtrando quem ainda
// deve e ordenando do menor pro maior.
export async function buscarAcertosPendentesDaSemana(): Promise<LinhaAcertoPendenteSemana[]> {
  const imports = await buscarImportsComAcerto()
  if (imports.length === 0) return []
  const importId = imports[0].id

  const [pagamentos, { data: acertosClub }] = await Promise.all([
    buscarPagamentosPorImport(importId),
    supabase.from('acertos').select('id, club_id').eq('import_id', importId),
  ])
  const clubIdPorAcertoId = new Map(
    ((acertosClub ?? []) as { id: string; club_id: string | null }[]).map((a) => [a.id, a.club_id])
  )

  const pendentes = pagamentos.filter((p) => p.diferenca < -0.005)
  const clubIds = [...new Set(pendentes.map((p) => clubIdPorAcertoId.get(p.acerto_id)).filter((id): id is string => !!id))]
  const statusPorClube = await statusStoplossPorClube(clubIds)

  return pendentes
    .map((p) => {
      const clubId = clubIdPorAcertoId.get(p.acerto_id) ?? null
      return {
        clubId: clubId ?? '',
        clubExternalId: p.club_external_id,
        clubName: p.club_name,
        status: clubId ? statusPorClube.get(clubId) ?? 'ativo' : 'ativo',
        acerto: Math.abs(p.valor_acerto),
        pago: Math.abs(p.valor_pago),
        diferenca: Math.abs(p.diferenca),
      }
    })
    .sort((a, b) => a.diferenca - b.diferenca)
}

export interface LinhaInadimplencia {
  clubId: string
  clubExternalId: string
  clubName: string
  status: StatusStoploss
  data: string
  divida: number
  totalPago: number
  totalPendente: number
  semanasEmAtraso: number
}

export interface InadimplenciaResultado {
  atrasados: LinhaInadimplencia[]
  inadimplentes: LinhaInadimplencia[]
  historico: LinhaInadimplencia[]
}

// "Acerto não pago (inadimplência)" — sem multa, sem acordo, nada (isso é
// Dívidas/Acordos, coisa separada): só o Acerto semanal que o clube não
// pagou (ou pagou só parte), somado semana a semana. Atrasados = até 8
// semanas desde a semana mais antiga ainda em aberto; Inadimplentes = mais
// de 8 semanas; Histórico = todo mundo que já deveu nesse período, pago ou
// não, pra calcular a Taxa de Pagamento (Total Pago / Dívida).
const LIMITE_SEMANAS_ATRASADO = 8
// ~1 ano de histórico — cobre Atrasados/Inadimplentes com folga; mais velho
// que isso a planilha do Cássio já trata como "não cobra mais".
const SEMANAS_LOOKBACK = 52

function semanasEntre(dataMaisAntiga: string, hoje: Date): number {
  const d = new Date(dataMaisAntiga + 'T00:00:00')
  return Math.floor((hoje.getTime() - d.getTime()) / (7 * 86400000))
}

interface Semana { periodEnd: string; valorCompleto: number; envios: number }
interface AcumClube { clubExternalId: string; clubName: string; semanas: Semana[] }

interface AcertoSaldoRow {
  id: string
  club_id: string | null
  club_external_id: string
  club_name: string
  valor_acerto: number
  bilhetes: number
  pendencias_antecipacao: number
  indicacao_valor: number
  import_id: string
}

// Valor completo aqui NÃO inclui Dívidas/Acordos (de propósito — essa
// tabela é só "não pagou o Acerto", os dois conceitos ficam separados) nem
// Lançamentos do período (bônus/promoção pontuais) — pra não multiplicar
// consultas por semana num relatório que já olha ~1 ano pra trás. Rake,
// Bilhetes, Pendências/Antecipação, Indicação e Segurança (fixo por clube)
// entram, iguais em toda semana.
async function buscarSaldosPorClube(): Promise<Map<string, AcumClube>> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - SEMANAS_LOOKBACK * 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data: importsData } = await supabase
    .from('imports')
    .select('id, period_end')
    .in('status', ['acertos_calculados', 'parcial'])
    .gte('period_end', cutoffStr)
  const periodEndPorImport = new Map(((importsData ?? []) as { id: string; period_end: string }[]).map((i) => [i.id, i.period_end]))
  const importIds = [...periodEndPorImport.keys()]
  const porClube = new Map<string, AcumClube>()
  if (importIds.length === 0) return porClube

  const { data: acertosData } = await supabase
    .from('acertos')
    .select('id, club_id, club_external_id, club_name, valor_acerto, bilhetes, pendencias_antecipacao, indicacao_valor, import_id')
    .in('import_id', importIds)
  const acertos = (acertosData ?? []) as AcertoSaldoRow[]
  if (acertos.length === 0) return porClube

  const acertoIds = acertos.map((a) => a.id)
  const clubIds = [...new Set(acertos.map((a) => a.club_id).filter((id): id is string => !!id))]

  const [{ data: enviosData }, { data: clubesData }] = await Promise.all([
    supabase.from('lancamentos').select('acerto_id, natureza, valor').in('acerto_id', acertoIds).in('tipo', ['pagamento', 'antecipacao']),
    clubIds.length > 0 ? supabase.from('clubs').select('id, security').in('id', clubIds) : Promise.resolve({ data: [] as { id: string; security: number | null }[] }),
  ])
  const enviosPorAcerto = new Map<string, number>()
  for (const e of (enviosData ?? []) as { acerto_id: string; natureza: 'credito' | 'debito'; valor: number }[]) {
    enviosPorAcerto.set(e.acerto_id, (enviosPorAcerto.get(e.acerto_id) ?? 0) + (e.natureza === 'credito' ? e.valor : -e.valor))
  }
  const securityPorClube = new Map(((clubesData ?? []) as { id: string; security: number | null }[]).map((c) => [c.id, c.security ?? 0]))

  for (const a of acertos) {
    if (!a.club_id) continue
    const periodEnd = periodEndPorImport.get(a.import_id)
    if (!periodEnd) continue
    const valorCompleto = a.valor_acerto + a.bilhetes + a.pendencias_antecipacao + a.indicacao_valor + (securityPorClube.get(a.club_id) ?? 0)
    if (valorCompleto >= -0.005) continue // clube não devia nessa semana
    const envios = enviosPorAcerto.get(a.id) ?? 0
    const existente = porClube.get(a.club_id) ?? { clubExternalId: a.club_external_id, clubName: a.club_name, semanas: [] }
    existente.semanas.push({ periodEnd, valorCompleto, envios })
    porClube.set(a.club_id, existente)
  }
  return porClube
}

function construirLinhas(porClube: Map<string, AcumClube>, apenasEmAberto: boolean, hoje: Date): LinhaInadimplencia[] {
  const linhas: LinhaInadimplencia[] = []
  for (const [clubId, v] of porClube) {
    const semanas = apenasEmAberto ? v.semanas.filter((s) => s.valorCompleto + s.envios < -0.005) : v.semanas
    if (semanas.length === 0) continue
    const divida = Math.round(semanas.reduce((s, w) => s + Math.abs(w.valorCompleto), 0) * 100) / 100
    const totalPago = Math.round(semanas.reduce((s, w) => s + w.envios, 0) * 100) / 100
    const totalPendente = Math.round((divida - totalPago) * 100) / 100
    if (apenasEmAberto && totalPendente <= 0.005) continue
    const data = semanas.reduce((min, w) => (w.periodEnd < min ? w.periodEnd : min), semanas[0].periodEnd)
    linhas.push({
      clubId, clubExternalId: v.clubExternalId, clubName: v.clubName,
      status: 'ativo', data, divida, totalPago, totalPendente,
      semanasEmAtraso: semanasEntre(data, hoje),
    })
  }
  return linhas
}

export async function buscarInadimplencia(): Promise<InadimplenciaResultado> {
  const porClube = await buscarSaldosPorClube()
  const hoje = new Date()
  const abertas = construirLinhas(porClube, true, hoje)
  const todas = construirLinhas(porClube, false, hoje)

  const clubIds = [...new Set([...abertas, ...todas].map((l) => l.clubId))]
  const statusPorClube = await statusStoplossPorClube(clubIds)
  for (const l of abertas) l.status = statusPorClube.get(l.clubId) ?? 'ativo'
  for (const l of todas) l.status = statusPorClube.get(l.clubId) ?? 'ativo'

  const porPendente = (a: LinhaInadimplencia, b: LinhaInadimplencia) => a.totalPendente - b.totalPendente
  return {
    atrasados: abertas.filter((l) => l.semanasEmAtraso <= LIMITE_SEMANAS_ATRASADO).sort(porPendente),
    inadimplentes: abertas.filter((l) => l.semanasEmAtraso > LIMITE_SEMANAS_ATRASADO).sort(porPendente),
    historico: todas.sort((a, b) => b.data.localeCompare(a.data)),
  }
}

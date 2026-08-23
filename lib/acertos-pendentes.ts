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

export interface LinhaDividaAntiga {
  clubId: string
  clubExternalId: string
  clubName: string
  status: StatusStoploss
  data: string | null
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

interface DividaAtivaRow {
  id: string
  clube_id: string
  tipo: 'simples' | 'acordo'
  valor_integral: number
  clubs: { name: string; external_id: string | null } | null
}

interface ParcelaAntigaRow {
  divida_id: string
  valor: number
  vencimento: string
  pago: boolean
  valor_pago: number | null
}

// "Clubes com Dívidas Antigas": todas as Dívidas/Acordos ainda ativos
// (status='ativo' em `dividas`, independente de estarem marcados "Pagar com
// Rake" — isso aqui é visão de cobrança, não o desconto automático do
// Acerto). Acerto = valor total da dívida (Simples: valor_integral; Acordo:
// soma de todas as parcelas), Pago = soma das parcelas já pagas, Diferença =
// o que falta. Data = vencimento da parcela em aberto mais antiga (Simples
// não tem parcela, fica "?" pro Cássio).
export async function buscarClubesComDividasAntigas(): Promise<LinhaDividaAntiga[]> {
  const { data: dividasData } = await supabase
    .from('dividas')
    .select('id, clube_id, tipo, valor_integral, clubs(name, external_id)')
    .eq('status', 'ativo')
  const dividas = (dividasData ?? []) as unknown as DividaAtivaRow[]
  if (dividas.length === 0) return []

  const dividaIdsAcordo = dividas.filter((d) => d.tipo === 'acordo').map((d) => d.id)
  const { data: parcelasData } = dividaIdsAcordo.length > 0
    ? await supabase.from('divida_parcelas').select('divida_id, valor, vencimento, pago, valor_pago').in('divida_id', dividaIdsAcordo)
    : { data: [] as ParcelaAntigaRow[] }
  const parcelasPorDivida = new Map<string, ParcelaAntigaRow[]>()
  for (const p of (parcelasData ?? []) as ParcelaAntigaRow[]) {
    const lista = parcelasPorDivida.get(p.divida_id) ?? []
    lista.push(p)
    parcelasPorDivida.set(p.divida_id, lista)
  }

  interface Acum { clubName: string; clubExternalId: string; acerto: number; pago: number; data: string | null }
  const porClube = new Map<string, Acum>()
  for (const d of dividas) {
    const existente = porClube.get(d.clube_id) ?? {
      clubName: d.clubs?.name ?? '—',
      clubExternalId: d.clubs?.external_id ?? '',
      acerto: 0,
      pago: 0,
      data: null,
    }
    if (d.tipo === 'simples') {
      existente.acerto += d.valor_integral
    } else {
      for (const p of parcelasPorDivida.get(d.id) ?? []) {
        existente.acerto += p.valor
        if (p.pago) {
          existente.pago += p.valor_pago ?? p.valor
        } else if (!existente.data || p.vencimento < existente.data) {
          existente.data = p.vencimento
        }
      }
    }
    porClube.set(d.clube_id, existente)
  }

  const clubIds = [...porClube.keys()]
  const statusPorClube = await statusStoplossPorClube(clubIds)

  return [...porClube.entries()]
    .map(([clubId, v]) => ({
      clubId,
      clubExternalId: v.clubExternalId,
      clubName: v.clubName,
      status: statusPorClube.get(clubId) ?? 'ativo',
      data: v.data,
      acerto: v.acerto,
      pago: v.pago,
      diferenca: Math.round((v.acerto - v.pago) * 100) / 100,
    }))
    .filter((l) => l.diferenca > 0.005)
    .sort((a, b) => a.diferenca - b.diferenca)
}

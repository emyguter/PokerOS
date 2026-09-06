import { supabase } from './supabase'

// Histórico de Dívidas/Acertos Pendentes importado da planilha manual do
// Cássio (2021-2026, antes do relatório "Histórico de Acertos Pendentes"
// existir) — só leitura/referência, ver 20260906010000_dividas_historico.sql.
export interface LinhaDividaHistorico {
  id: string
  liga: 'LP' | 'ORION'
  ano: number
  data: string
  clubeId: string | null
  clubName: string
  status: string | null
  debet: number
  pago: number
  total: number
  startToPay: string | null
  obs: string | null
}

export interface FiltroDividasHistorico {
  clubeId?: string
  liga?: 'LP' | 'ORION'
  ano?: number
}

interface DividaHistoricoRow {
  id: string
  liga_planilha: 'LP' | 'ORION'
  ano: number
  data: string
  clube_id: string | null
  club_name_original: string
  status: string | null
  debet: number
  pago: number
  total: number
  start_to_pay: string | null
  obs: string | null
}

export async function buscarDividasHistorico(filtro: FiltroDividasHistorico = {}): Promise<LinhaDividaHistorico[]> {
  let query = supabase
    .from('dividas_historico')
    .select('id, liga_planilha, ano, data, clube_id, club_name_original, status, debet, pago, total, start_to_pay, obs')
    .order('ano', { ascending: false })
    .order('data', { ascending: false })
  if (filtro.clubeId) query = query.eq('clube_id', filtro.clubeId)
  if (filtro.liga) query = query.eq('liga_planilha', filtro.liga)
  if (filtro.ano) query = query.eq('ano', filtro.ano)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as DividaHistoricoRow[]).map((r) => ({
    id: r.id,
    liga: r.liga_planilha,
    ano: r.ano,
    data: r.data,
    clubeId: r.clube_id,
    clubName: r.club_name_original,
    status: r.status,
    debet: r.debet,
    pago: r.pago,
    total: r.total,
    startToPay: r.start_to_pay,
    obs: r.obs,
  }))
}

export async function buscarAnosDividasHistorico(): Promise<number[]> {
  const { data, error } = await supabase.from('dividas_historico').select('ano')
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.ano as number))].sort((a, b) => b - a)
}

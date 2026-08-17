import { supabase } from './supabase'

export interface AcertoConferencia {
  club_id: string | null
  club_name: string
  club_external_id: string
  rake_total: number
  player_result: number
  bilhetes: number
}

// Mesma tolerância usada em outras comparações de valor do app (ex:
// useConciliacao.valorBate) — evita falso "não bate" por arredondamento.
export function valoresBatem(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

// "Minimamente os 3 clubes de maior rake" desse import — a amostra que a
// Conferência do App usa pra checar se Rake/Ganhos/Bilhetes calculados
// batem com o que o Suporte vê direto na plataforma.
export async function buscarTop3RakeDoImport(importId: string): Promise<AcertoConferencia[]> {
  const { data } = await supabase
    .from('acertos')
    .select('club_id, club_name, club_external_id, rake_total, player_result, bilhetes')
    .eq('import_id', importId)
    .order('rake_total', { ascending: false })
    .limit(3)
  return (data ?? []) as AcertoConferencia[]
}

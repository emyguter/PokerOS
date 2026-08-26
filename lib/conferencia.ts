import { supabase } from './supabase'

export interface AcertoConferencia {
  club_id: string | null
  club_name: string
  club_external_id: string
  rake_total: number
  player_result: number
}

// Mesma tolerância usada em outras comparações de valor do app (ex:
// useConciliacao.valorBate) — evita falso "não bate" por arredondamento.
export function valoresBatem(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

// "Minimamente os 3 clubes de maior rake" desse import — a amostra que a
// Conferência do App usa pra checar se Rake/Ganhos calculados batem com o
// que o Suporte vê direto na plataforma.
export async function buscarTop3RakeDoImport(importId: string): Promise<AcertoConferencia[]> {
  const { data } = await supabase
    .from('acertos')
    .select('club_id, club_name, club_external_id, rake_total, player_result')
    .eq('import_id', importId)
    .order('rake_total', { ascending: false })
    .limit(3)
  return (data ?? []) as AcertoConferencia[]
}

// "Liberar Acerto": carimbo de que o Suporte conferiu Rake/Ganhos dos
// clubes de maior rake e bateu tudo com o app da plataforma. Só um registro
// (data) — não trava nem libera nada em outra tela, de propósito.
export async function marcarConferido(importId: string): Promise<string> {
  const agora = new Date().toISOString()
  const { error } = await supabase.from('imports').update({ conferido_em: agora }).eq('id', importId)
  if (error) throw error
  return agora
}

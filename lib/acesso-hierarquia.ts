import { supabase } from './supabase'

export interface PerfilComHierarquia {
  clube_id: string | null
  liga_id: string | null
  super_league_id: string | null
  mega_liga_id: string | null
}

// Quais clube_id um login vinculado a uma entidade da hierarquia (MegaLiga >
// SuperLiga > Liga > Clube) pode ver no menu Acertos — só em cascata pra
// baixo, nunca pros lados nem pra cima (confirmado pelo Cássio: "eu vejo a
// mim e quem está abaixo"). `null` = sem restrição (staff, acesso por
// permissão em vez de vínculo de entidade); `[]` = vinculado a uma entidade
// sem nenhum clube abaixo ainda.
export async function resolverClubesVisiveis(perfil: PerfilComHierarquia | null): Promise<string[] | null> {
  if (!perfil) return []

  // Login de Clube vê também o(s) outro(s) clube(s) vinculados pra Acerto
  // (mesmo clube em mais de uma plataforma/Liga, ex: GG-Poker 2 na Liga
  // Particular + G G Poker na ORION — ver clubs.vinculo_acerto_grupo_id) —
  // pedido do Cássio: o CLUBE em si pode ver o total somado das duas
  // plataformas, diferente do login de Liga (que só vê a própria, pra não
  // se confundir somando o valor da outra Liga — ver ClubAcertoCard.tsx).
  if (perfil.clube_id) {
    const { data: clube } = await supabase.from('clubs').select('vinculo_acerto_grupo_id').eq('id', perfil.clube_id).single()
    const ancora = clube?.vinculo_acerto_grupo_id ?? perfil.clube_id
    const { data: grupo } = await supabase.from('clubs').select('id').or(`id.eq.${ancora},vinculo_acerto_grupo_id.eq.${ancora}`)
    const ids = (grupo ?? []).map((c) => c.id as string)
    return ids.length > 0 ? ids : [perfil.clube_id]
  }

  if (perfil.liga_id) {
    const { data } = await supabase.from('clubs').select('id').eq('league_id', perfil.liga_id)
    return (data ?? []).map((c) => c.id as string)
  }

  if (perfil.super_league_id) {
    const { data: ligas } = await supabase.from('leagues').select('id').eq('super_league_id', perfil.super_league_id)
    const ligaIds = (ligas ?? []).map((l) => l.id as string)
    if (ligaIds.length === 0) return []
    const { data } = await supabase.from('clubs').select('id').in('league_id', ligaIds)
    return (data ?? []).map((c) => c.id as string)
  }

  if (perfil.mega_liga_id) {
    const { data: superLigas } = await supabase.from('super_leagues').select('id').eq('mega_liga_id', perfil.mega_liga_id)
    const superLigaIds = (superLigas ?? []).map((s) => s.id as string)
    if (superLigaIds.length === 0) return []
    const { data: ligas } = await supabase.from('leagues').select('id').in('super_league_id', superLigaIds)
    const ligaIds = (ligas ?? []).map((l) => l.id as string)
    if (ligaIds.length === 0) return []
    const { data } = await supabase.from('clubs').select('id').in('league_id', ligaIds)
    return (data ?? []).map((c) => c.id as string)
  }

  return null
}

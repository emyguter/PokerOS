import { createClient } from '@supabase/supabase-js'
import type { SuperLeague, SuperLeagueForm, League, LeagueForm, Club, ClubForm } from './types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function getSuperLeagues(): Promise<SuperLeague[]> {
  const { data, error } = await supabase.from('super_leagues').select('*').order('name')
  if (error) throw error
  return data
}
export async function createSuperLeague(form: SuperLeagueForm): Promise<SuperLeague> {
  const { data, error } = await supabase.from('super_leagues').insert(form).select().single()
  if (error) throw error
  return data
}
export async function updateSuperLeague(id: string, form: SuperLeagueForm): Promise<SuperLeague> {
  const { data, error } = await supabase.from('super_leagues').update(form).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteSuperLeague(id: string): Promise<void> {
  const { error } = await supabase.from('super_leagues').delete().eq('id', id)
  if (error) throw error
}

export async function getLeagues(): Promise<League[]> {
  const { data, error } = await supabase.from('leagues').select('*, super_league:super_leagues(id, name, moeda)').order('name')
  if (error) throw error
  return data
}
export async function createLeague(form: LeagueForm): Promise<League> {
  const { data, error } = await supabase.from('leagues').insert(form).select('*, super_league:super_leagues(id, name, moeda)').single()
  if (error) throw error
  return data
}
export async function updateLeague(id: string, form: LeagueForm): Promise<League> {
  const { data, error } = await supabase.from('leagues').update(form).eq('id', id).select('*, super_league:super_leagues(id, name, moeda)').single()
  if (error) throw error
  return data
}
export async function deleteLeague(id: string): Promise<void> {
  const { error } = await supabase.from('leagues').delete().eq('id', id)
  if (error) throw error
}

export async function getClubs(leagueId?: string): Promise<Club[]> {
  let query = supabase.from('clubs').select('*, league:leagues(id, name, moeda)').order('name')
  if (leagueId) query = query.eq('league_id', leagueId)
  const { data, error } = await query
  if (error) throw error
  return data
}
export async function createClub(form: ClubForm): Promise<Club> {
  const { data, error } = await supabase.from('clubs').insert(form).select('*, league:leagues(id, name, moeda)').single()
  if (error) throw error
  return data
}
export async function updateClub(id: string, form: ClubForm): Promise<Club> {
  const { data, error } = await supabase.from('clubs').update(form).eq('id', id).select('*, league:leagues(id, name, moeda)').single()
  if (error) throw error
  return data
}
export async function deleteClub(id: string): Promise<void> {
  const { error } = await supabase.from('clubs').delete().eq('id', id)
  if (error) throw error
}

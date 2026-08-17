import { supabase } from './supabase'

// Desfaz o vínculo de Conciliação do outro lado do par — usado antes de
// forçar a exclusão de um lançamento que está travado pela FK
// auto-referenciada lancamentos.conciliado_com (ver lib/errors.ts).
export async function desvincularConciliacao(lancamentoId: string): Promise<void> {
  await supabase.from('lancamentos').update({ conciliado_com: null, conciliado_em: null }).eq('conciliado_com', lancamentoId)
}

// Tipos que passam pelo fluxo de "Liberar para Acerto" — Bloqueio/Reembolso
// da Segurança e Bônus/Promoção/Outro do Suporte. Caução, Pagamento e
// Antecipação ficam de fora de propósito: já têm o próprio gate (validação
// da Genia, Acerto vinculado, Conciliação). O motor de cálculo soma tudo
// independente de liberado — só a visão do clube (app/extrato) esconde o
// que ainda não foi liberado.
export const TIPOS_LIBERAVEIS = ['seguranca_bloqueio', 'seguranca_reembolso', 'bonus', 'promocao', 'outro'] as const

export async function liberarLancamentos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('lancamentos')
    .update({ liberado: true, liberado_em: new Date().toISOString(), liberado_por: userData.user?.id ?? null })
    .in('id', ids)
  if (error) throw error
}

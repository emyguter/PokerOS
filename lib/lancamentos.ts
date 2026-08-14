import { supabase } from './supabase'

// Desfaz o vínculo de Conciliação do outro lado do par — usado antes de
// forçar a exclusão de um lançamento que está travado pela FK
// auto-referenciada lancamentos.conciliado_com (ver lib/errors.ts).
export async function desvincularConciliacao(lancamentoId: string): Promise<void> {
  await supabase.from('lancamentos').update({ conciliado_com: null, conciliado_em: null }).eq('conciliado_com', lancamentoId)
}

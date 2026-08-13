// Erros do Supabase (PostgrestError etc.) são objetos simples, não `Error` de
// verdade — `String(err)` neles vira "[object Object]" em vez da mensagem.
export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

// Excluir um lançamento que já foi vinculado numa Conciliação esbarra na FK
// auto-referenciada (lancamentos.conciliado_com) — o outro lado do vínculo
// ainda aponta pra essa linha. Sem isso, o Postgrest devolve só o erro cru
// (código 23503) e a exclusão parece simplesmente não fazer nada.
export function errMsgExclusaoLancamento(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === '23503') {
    return 'Esse lançamento está vinculado a uma Conciliação (casado com outro lançamento) — não dá pra excluir enquanto esse vínculo existir.'
  }
  return errMsg(err)
}

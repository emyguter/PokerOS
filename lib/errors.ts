// Erros do Supabase (PostgrestError etc.) são objetos simples, não `Error` de
// verdade — `String(err)` neles vira "[object Object]" em vez da mensagem.
export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

export function formatIndicadorNome(nome: string, descricao?: string | null): string {
  return descricao || nome
}

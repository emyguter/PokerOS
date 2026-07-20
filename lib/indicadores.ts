export function formatIndicadorNome(nome: string, descricao?: string | null): string {
  if (descricao) return descricao
  return nome
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

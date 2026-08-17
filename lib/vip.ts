export type TipoVip = 'silver' | 'black' | 'platinum'

// Limites mensais por clube, fixos — "se acabar, acabou" (Cássio). Não é
// configurável por clube, é regra da liga.
export const LIMITES_VIP: Record<TipoVip, number> = { silver: 20, black: 10, platinum: 5 }

export const TIPOS_VIP: { value: TipoVip; labelKey: string }[] = [
  { value: 'platinum', labelKey: 'vip.tipos.platinum' },
  { value: 'black', labelKey: 'vip.tipos.black' },
  { value: 'silver', labelKey: 'vip.tipos.silver' },
]

export type CorVip = 'vermelho' | 'amarelo' | 'branco'

// Vermelho = já atingiu (ou passou) o limite do mês; amarelo = perto (80%+);
// branco = tranquilo. `enviados` é o total já lançado no mês pra esse
// clube+tipo (contando a linha atual, se for o caso de checar antes de criar
// mais uma).
export function corVip(enviados: number, limite: number): CorVip {
  if (limite <= 0) return 'branco'
  const proporcao = enviados / limite
  if (proporcao >= 1) return 'vermelho'
  if (proporcao >= 0.8) return 'amarelo'
  return 'branco'
}

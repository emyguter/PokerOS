export type TipoVip = 'silver' | 'black' | 'platinum'

// Limite mensal por clube+tipo — configurável por clube (VIP → Configurar
// Limites), guardado em clubs.limite_vip_silver/black/platinum. Sem valor
// configurado (null) = 0 — "se acabar, acabou" até alguém definir o máximo
// daquele clube.
export const COLUNA_LIMITE_VIP: Record<TipoVip, 'limite_vip_silver' | 'limite_vip_black' | 'limite_vip_platinum'> = {
  silver: 'limite_vip_silver', black: 'limite_vip_black', platinum: 'limite_vip_platinum',
}

export interface LimitesVipClube {
  limite_vip_silver: number | null
  limite_vip_black: number | null
  limite_vip_platinum: number | null
}

export function limiteVipDoClube(clube: LimitesVipClube, tipo: TipoVip): number {
  return clube[COLUNA_LIMITE_VIP[tipo]] ?? 0
}

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

'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { getStoplossAtual } from '@/lib/stoploss'

export interface Entrada {
  id: string
  tipo: string
  natureza: 'credito' | 'debito'
  valor: number
  descricao: string | null
  data_lancamento: string
  origem: 'suporte' | 'genia'
  status: string | null
  clube_id: string
  clubs: { name: string } | null
}

export type Motivo = 'sem_par' | 'divergencia'

export interface ItemPendencia {
  motivo: Motivo
  principal: Entrada
  par?: Entrada
}

export type StatusLinha = 'conciliado' | 'divergente' | 'sem_par_suporte' | 'sem_par_genia'

export interface LinhaConciliacao {
  chave: string
  clube: string
  tipo: string
  data: string
  suporte?: Entrada
  genia?: Entrada
  status: StatusLinha
}

export const JANELA_DIAS = 7

export function diffDias(a: string, b: string) {
  return Math.abs((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)
}
export function valorBate(a: number, b: number) {
  return Math.abs(a - b) < 0.005
}
export function chaveBase(e: Pick<Entrada, 'clube_id' | 'tipo' | 'natureza'>) {
  return `${e.clube_id}|${e.tipo}|${e.natureza}`
}
function hojeMenos(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

// Tipos que nunca formam par Suporte×Genia por esse mecanismo — Caução tem
// fluxo próprio de mão única (Validar, ver FilaValidacao.tsx) e Bônus/
// Promoção/Outro vão direto pro "Liberar para Acerto" (ver TIPOS_LIBERAVEIS
// em lib/lancamentos.ts). Mesma lista usada no filtro de carga da tela de
// Conciliação (`load` abaixo) e em tentarConciliarAoLancar.
const TIPOS_SEM_CONCILIACAO = ['caucao', 'bonus', 'promocao', 'outro']

type EntradaMinima = Pick<Entrada, 'id' | 'clube_id' | 'tipo' | 'natureza' | 'valor'>

function maisDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Antecipação é a única que compõe o Stoploss do clube, e só quando concilia
// (antes disso é só uma promessa, igual Caução até a Genia confirmar) — usado
// tanto no auto-match quanto no vínculo manual, pra não deixar uma
// Antecipação conciliada na mão sem entrar no Stoploss.
export async function registrarAntecipacaoNoStoploss(suporte: EntradaMinima, criadoPor: string | null): Promise<void> {
  if (suporte.tipo !== 'antecipacao') return
  const atual = await getStoplossAtual(suporte.clube_id)
  const delta = suporte.natureza === 'credito' ? suporte.valor : -suporte.valor
  await supabase.from('stoploss_historico').insert({
    clube_id: suporte.clube_id,
    tipo: 'antecipacao',
    // Some sozinho na virada da semana, igual Bug PPP/Margem/Liberado pela
    // Gerência — Pre Payment não é permanente, é só enquanto durar a semana
    // em que a Antecipação foi conciliada.
    escopo: 'semanal',
    valor_delta: delta,
    valor_resultante: atual + delta,
    motivo: 'Antecipação conciliada',
    lancamento_id: suporte.id,
    criado_por: criadoPor,
  })
}

// Concilia um lançamento (Suporte ou Genia) contra o par do lado oposto NA
// HORA em que ele é lançado — sem isso, o par só casava quando alguém
// abrisse a tela de Conciliação/Pendências depois, o que deixava um
// Pagamento/Antecipação "sumido" (não contando em nada) até alguém lembrar
// de abrir aquela tela (pedido do Cássio: "não pode conciliar ao abrir a
// tela, tem que ser ao lançar mesmo", achado no caso INSTA PIX POK).
// Chamado pelo LancarForm logo depois do insert. Mesmo critério do
// auto-match da tela (clube+tipo+natureza, dentro de JANELA_DIAS, valor
// mais próximo) — só concilia de verdade quando o valor bate certinho; sem
// par ou com valor divergente, fica pendente igual sempre foi (resolvido
// depois em Conciliação/Pendências, editando o valor ou vinculando na mão).
export async function tentarConciliarAoLancar(novo: Pick<Entrada, 'id' | 'clube_id' | 'tipo' | 'natureza' | 'valor' | 'data_lancamento' | 'origem'>): Promise<void> {
  if (TIPOS_SEM_CONCILIACAO.includes(novo.tipo)) return
  const origemOposta = novo.origem === 'suporte' ? 'genia' : 'suporte'

  const { data } = await supabase
    .from('lancamentos')
    .select('id, tipo, natureza, valor, descricao, data_lancamento, origem, status, clube_id, conciliado_com, clubs(name)')
    .eq('clube_id', novo.clube_id)
    .eq('tipo', novo.tipo)
    .eq('natureza', novo.natureza)
    .eq('origem', origemOposta)
    .is('conciliado_com', null)
    .or('descricao.neq.Rollover,descricao.is.null')
    .gte('data_lancamento', maisDias(novo.data_lancamento, -JANELA_DIAS))
    .lte('data_lancamento', maisDias(novo.data_lancamento, JANELA_DIAS))

  const candidatos = (data ?? []) as unknown as Entrada[]
  if (candidatos.length === 0) return

  const melhor = [...candidatos].sort((a, b) => {
    const diffValorA = Math.abs(a.valor - novo.valor), diffValorB = Math.abs(b.valor - novo.valor)
    if (diffValorA !== diffValorB) return diffValorA - diffValorB
    return diffDias(a.data_lancamento, novo.data_lancamento) - diffDias(b.data_lancamento, novo.data_lancamento)
  })[0]

  if (!valorBate(melhor.valor, novo.valor)) return

  const agora = new Date().toISOString()
  await Promise.all([
    supabase.from('lancamentos').update({ conciliado_com: melhor.id, conciliado_em: agora }).eq('id', novo.id),
    supabase.from('lancamentos').update({ conciliado_com: novo.id, conciliado_em: agora }).eq('id', melhor.id),
  ])

  if (novo.tipo === 'antecipacao') {
    const suporte = novo.origem === 'suporte' ? novo : melhor
    const { data: userData } = await supabase.auth.getUser()
    await registrarAntecipacaoNoStoploss(suporte, userData.user?.id ?? null)
  }
}

// Casa os lançamentos do Suporte com os da Genia por clube+tipo+natureza,
// preferindo o candidato com valor mais próximo dentro de uma janela de
// dias — usado tanto pelas telas de Pendências (uma lista por vez) quanto
// pela Conciliação (tabela lado a lado).
export function useConciliacao() {
  const [dataInicio, setDataInicio] = useState(hojeMenos(60))
  const [dataFim, setDataFim] = useState('')
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let query = supabase
        .from('lancamentos')
        .select('id, tipo, natureza, valor, descricao, data_lancamento, origem, status, clube_id, conciliado_com, clubs(name)')
        // Caução não usa esse tipo de Conciliação (par Suporte×Genia) — ela
        // tem o próprio fluxo de mão única: Suporte lança, entra direto em
        // "em_validacao" (LancarForm), e a Genia confirma clicando Validar
        // na Fila de Validação (FilaValidacao.tsx), que atualiza
        // clubs.caucao_atual na hora. Nunca existe um segundo lançamento
        // (origem 'genia') pra parear — incluir Caução aqui faria ela
        // aparecer pra sempre como "Falta Financeiro", mesmo depois de já
        // validada (Validar não seta conciliado_com).
        .neq('tipo', 'caucao')
        // Bônus/Promoção/Outro não passam por Conciliação — vão direto pro
        // fluxo "Liberar para Acerto" (ver TIPOS_LIBERAVEIS em
        // lib/lancamentos.ts) e só aparecem no Extrato do clube depois de
        // liberados. Sem esses filtros, entravam aqui igual Caução/Pagamento/
        // Antecipação (que sim usam Conciliação de propósito).
        .neq('tipo', 'bonus')
        .neq('tipo', 'promocao')
        .neq('tipo', 'outro')
        // Rollover (ver rolloverAcerto em lib/pagamentos.ts) é decisão só do
        // Suporte, sem dinheiro de verdade se movendo — não tem "lado da
        // Genia" pra confirmar, então nunca teria par e ficaria pendurado
        // pra sempre em "Falta Financeiro" (achado no INTERLAGOS CLUB).
        // IMPORTANTE: .neq('descricao', 'Rollover') sozinho excluía TAMBÉM
        // todo lançamento com descrição em branco (a maioria — é campo
        // opcional no formulário) — em SQL, `coluna <> valor` nunca é
        // verdadeiro quando a coluna é NULL, então a linha inteira sumia da
        // Conciliação/Pendências sem avisar nada. Achado no caso AMORIM
        // PLUS (reportado pelo Cássio): Antecipação de R$1.999,60 dos dois
        // lados (Suporte e Financeiro), sem descrição, nunca aparecia pra
        // casar. .or() com .is.null explícito garante que NULL passa.
        .or('descricao.neq.Rollover,descricao.is.null')
        .gte('data_lancamento', dataInicio)
        .order('data_lancamento', { ascending: true })
      if (dataFim) query = query.lte('data_lancamento', dataFim)
      const { data, error: err } = await query
      if (err) throw err
      setEntradas(((data ?? []) as unknown as (Entrada & { conciliado_com: string | null })[]).filter(e => !e.conciliado_com))
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => { load() }, [load])

  const { pendGenia, pendSuporte, linhas } = useMemo(() => {
    const suporte = entradas.filter(e => e.origem === 'suporte')
    const genia = entradas.filter(e => e.origem === 'genia')

    const geniaPorChave = new Map<string, Entrada[]>()
    for (const g of genia) {
      const k = chaveBase(g)
      geniaPorChave.set(k, [...(geniaPorChave.get(k) ?? []), g])
    }
    const geniaUsados = new Set<string>()

    const pendGenia: ItemPendencia[] = []
    const pendSuporte: ItemPendencia[] = []
    const linhas: LinhaConciliacao[] = []

    for (const s of suporte) {
      const candidatos = (geniaPorChave.get(chaveBase(s)) ?? []).filter(g => !geniaUsados.has(g.id))
      const melhor = candidatos
        .filter(g => diffDias(g.data_lancamento, s.data_lancamento) <= JANELA_DIAS)
        .sort((a, b) => {
          const diffValorA = Math.abs(a.valor - s.valor), diffValorB = Math.abs(b.valor - s.valor)
          if (diffValorA !== diffValorB) return diffValorA - diffValorB
          return diffDias(a.data_lancamento, s.data_lancamento) - diffDias(b.data_lancamento, s.data_lancamento)
        })[0]

      if (!melhor) {
        pendGenia.push({ motivo: 'sem_par', principal: s })
        linhas.push({ chave: s.id, clube: s.clubs?.name ?? '—', tipo: s.tipo, data: s.data_lancamento, suporte: s, status: 'sem_par_genia' })
        continue
      }
      geniaUsados.add(melhor.id)
      if (valorBate(melhor.valor, s.valor)) {
        // Achou o par certo, mas NÃO vincula sozinho só de abrir essa tela
        // (pedido do Cássio, achado no INSTA PIX POK: "não pode conciliar
        // ao abrir a tela, tem que ser ao lançar mesmo") — o normal é isso
        // já ter acontecido na hora do lançamento (ver tentarConciliarAoLancar,
        // chamado pelo LancarForm). Só chega até aqui ainda pendente um
        // lançamento de antes desse fix, ou algum caso raro — mostra em
        // Pendências com o par já pré-selecionado (`par: melhor`), só falta
        // clicar em Vincular pra confirmar de verdade.
        pendGenia.push({ motivo: 'sem_par', principal: s, par: melhor })
        pendSuporte.push({ motivo: 'sem_par', principal: melhor, par: s })
        linhas.push({ chave: s.id, clube: s.clubs?.name ?? '—', tipo: s.tipo, data: s.data_lancamento, suporte: s, status: 'sem_par_genia' })
      } else {
        pendGenia.push({ motivo: 'divergencia', principal: s, par: melhor })
        pendSuporte.push({ motivo: 'divergencia', principal: melhor, par: s })
        linhas.push({ chave: s.id, clube: s.clubs?.name ?? '—', tipo: s.tipo, data: s.data_lancamento, suporte: s, genia: melhor, status: 'divergente' })
      }
    }
    for (const g of genia) {
      if (!geniaUsados.has(g.id)) {
        pendSuporte.push({ motivo: 'sem_par', principal: g })
        linhas.push({ chave: g.id, clube: g.clubs?.name ?? '—', tipo: g.tipo, data: g.data_lancamento, genia: g, status: 'sem_par_suporte' })
      }
    }

    linhas.sort((a, b) => a.data.localeCompare(b.data))
    return { pendGenia, pendSuporte, linhas }
  }, [entradas])

  async function salvarValor(id: string, valorNovo: number) {
    await supabase.from('lancamentos').update({ valor: valorNovo }).eq('id', id)
    await load()
  }

  async function vincular(principalId: string, outroId: string) {
    const agora = new Date().toISOString()
    await Promise.all([
      supabase.from('lancamentos').update({ conciliado_com: outroId, conciliado_em: agora }).eq('id', principalId),
      supabase.from('lancamentos').update({ conciliado_com: principalId, conciliado_em: agora }).eq('id', outroId),
    ])
    const suporteAntecipacao = [principalId, outroId]
      .map(id => entradas.find(e => e.id === id))
      .find((e): e is Entrada => !!e && e.origem === 'suporte' && e.tipo === 'antecipacao')
    if (suporteAntecipacao) {
      const { data: userData } = await supabase.auth.getUser()
      await registrarAntecipacaoNoStoploss(suporteAntecipacao, userData.user?.id ?? null)
    }
    await load()
  }

  const geniaEntradas = useMemo(() => entradas.filter(e => e.origem === 'genia'), [entradas])
  const suporteEntradas = useMemo(() => entradas.filter(e => e.origem === 'suporte'), [entradas])

  return {
    dataInicio, setDataInicio, dataFim, setDataFim,
    loading, error,
    pendGenia, pendSuporte, linhas,
    geniaEntradas, suporteEntradas,
    salvarValor, vincular,
  }
}

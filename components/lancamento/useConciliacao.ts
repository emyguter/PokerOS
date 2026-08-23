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

const JANELA_DIAS = 7

function diffDias(a: string, b: string) {
  return Math.abs((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)
}
function valorBate(a: number, b: number) {
  return Math.abs(a - b) < 0.005
}
function chaveBase(e: Entrada) {
  return `${e.clube_id}|${e.tipo}|${e.natureza}`
}
function hojeMenos(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

// Antecipação é a única que compõe o Stoploss do clube, e só quando concilia
// (antes disso é só uma promessa, igual Caução até a Genia confirmar) — usado
// tanto no auto-match quanto no vínculo manual, pra não deixar uma
// Antecipação conciliada na mão sem entrar no Stoploss.
async function registrarAntecipacaoNoStoploss(suporte: Entrada, criadoPor: string | null): Promise<void> {
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

// Casa os lançamentos do Suporte com os da Genia por clube+tipo+natureza,
// preferindo o candidato com valor mais próximo dentro de uma janela de
// dias — usado tanto pelas telas de Pendências (uma lista por vez) quanto
// pela Conciliação (tabela lado a lado).
export function useConciliacao() {
  const [dataInicio, setDataInicio] = useState(hojeMenos(60))
  const [dataFim, setDataFim] = useState('')
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      let query = supabase
        .from('lancamentos')
        .select('id, tipo, natureza, valor, descricao, data_lancamento, origem, status, clube_id, conciliado_com, clubs(name)')
        .neq('tipo', 'caucao')
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

  const { pendGenia, pendSuporte, conciliadosAgora, linhas } = useMemo(() => {
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
    const conciliadosAgora: { suporte: Entrada; genia: Entrada }[] = []
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
        conciliadosAgora.push({ suporte: s, genia: melhor })
        linhas.push({ chave: s.id, clube: s.clubs?.name ?? '—', tipo: s.tipo, data: s.data_lancamento, suporte: s, genia: melhor, status: 'conciliado' })
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
    return { pendGenia, pendSuporte, conciliadosAgora, linhas }
  }, [entradas])

  // Persiste os pares que bateram certinho, pra não reprocessar toda vez —
  // e some da lista na próxima carga (filtro `!conciliado_com` no load).
  // Antecipação é a única que compõe o Stoploss do clube, e só quando
  // concilia (antes disso é só uma promessa, igual Caução até a Genia confirmar).
  useEffect(() => {
    if (conciliadosAgora.length === 0) return
    setProcessando(true)
    ;(async () => {
      const agora = new Date().toISOString()
      await Promise.all(conciliadosAgora.flatMap(({ suporte, genia }) => [
        supabase.from('lancamentos').update({ conciliado_com: genia.id, conciliado_em: agora }).eq('id', suporte.id),
        supabase.from('lancamentos').update({ conciliado_com: suporte.id, conciliado_em: agora }).eq('id', genia.id),
      ]))

      const antecipacoes = conciliadosAgora.filter(({ suporte }) => suporte.tipo === 'antecipacao')
      if (antecipacoes.length > 0) {
        const { data: userData } = await supabase.auth.getUser()
        for (const { suporte } of antecipacoes) await registrarAntecipacaoNoStoploss(suporte, userData.user?.id ?? null)
      }

      setProcessando(false); load()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conciliadosAgora])

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
    loading: loading || processando, processando, error,
    pendGenia, pendSuporte, linhas,
    geniaEntradas, suporteEntradas,
    salvarValor, vincular,
  }
}

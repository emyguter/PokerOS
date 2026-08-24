'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { useConciliacao } from '@/components/lancamento/useConciliacao'
import { BuscaSelect } from '@/components/BuscaSelect'
import { buscarHistoricoAcertosPendentes, type LinhaInadimplencia, type StatusStoploss } from '@/lib/acertos-pendentes'
import { errMsg } from '@/lib/errors'
import { TabelaInadimplencia } from './AcertosPendentesShared'

interface ClubeOpcao { id: string; name: string; projeto: string | null }

export function RelatorioHistoricoAcertosPendentes() {
  const { t } = useI18n()
  const { loading: loadingConciliacao, pendGenia, pendSuporte } = useConciliacao()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState('')
  const [projeto, setProjeto] = useState('')
  const [status, setStatus] = useState<StatusStoploss | ''>('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [linhas, setLinhas] = useState<LinhaInadimplencia[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const totalPendencias = pendGenia.length + pendSuporte.length
  const conciliacaoZerada = !loadingConciliacao && totalPendencias === 0

  useEffect(() => {
    supabase.from('clubs').select('id, name, projeto').order('name').then(({ data }) => setClubes((data ?? []) as ClubeOpcao[]))
  }, [])

  const projetosDisponiveis = useMemo(
    () => [...new Set(clubes.map((c) => c.projeto).filter((p): p is string => !!p))].sort(),
    [clubes]
  )

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const dados = await buscarHistoricoAcertosPendentes({
        clubeId: clubeId || undefined,
        projeto: projeto || undefined,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
      })
      setLinhas(dados)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [clubeId, projeto, dataInicio, dataFim])

  useEffect(() => {
    if (!conciliacaoZerada) return
    load()
  }, [conciliacaoZerada, load])

  const linhasFiltradas = status ? linhas.filter((l) => l.status === status) : linhas

  if (loadingConciliacao) {
    return <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
  }

  if (!conciliacaoZerada) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <AlertTriangle size={28} className="text-gold" />
        <p className="text-white font-medium">{t('acertos_pendentes.conciliacao_bloqueado_titulo')}</p>
        <p className="text-sm text-gray-500 max-w-md">{t('acertos_pendentes.conciliacao_bloqueado_desc', { n: totalPendencias })}</p>
        <Link href="/financeiro?tab=conciliacao" className="mt-2 px-4 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
          {t('acertos_pendentes.ir_para_conciliacao')}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('stoploss.clube')}</label>
          <BuscaSelect
            value={clubeId}
            onChange={setClubeId}
            opcoes={clubes.map((c) => ({ id: c.id, nome: c.name }))}
            placeholder={t('relatorios.todos_clubes')}
            vazio={t('relatorios.todos_clubes')}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('acertos_pendentes.col_projeto')}</label>
          <select value={projeto} onChange={(e) => setProjeto(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            <option value="">{t('acertos_pendentes.todos_projetos')}</option>
            {projetosDisponiveis.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('acertos_pendentes.col_status')}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusStoploss | '')} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
            <option value="">{t('acertos_pendentes.todos_status')}</option>
            <option value="ativo">{t('acertos_pendentes.status_ativo')}</option>
            <option value="50%">{t('acertos_pendentes.status_50')}</option>
            <option value="bloqueado">{t('acertos_pendentes.status_bloqueado')}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('acertos_pendentes.data_de')}</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('acertos_pendentes.data_ate')}</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      {loading ? (
        <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
      ) : (
        <TabelaInadimplencia titulo={t('acertos_pendentes.historico_titulo')} linhas={linhasFiltradas} vazio={t('acertos_pendentes.nenhum_historico')} mostrarTaxa />
      )}
    </div>
  )
}

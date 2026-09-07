'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { usePermissions } from '@/lib/permissions'
import { ExtratoView } from '@/components/lancamento/ExtratoView'
import { RelatorioLancamentos } from './RelatorioLancamentos'
import { RelatorioTaxas } from './RelatorioTaxas'
import { RelatorioResumoAcertos } from './RelatorioResumoAcertos'
import { RelatorioAcertosPendentes } from './RelatorioAcertosPendentes'
import { RelatorioHistoricoAcertosPendentes } from './RelatorioHistoricoAcertosPendentes'
import { RelatorioDividasHistorico } from './RelatorioDividasHistorico'

type Tab = 'lancamentos' | 'taxas' | 'resumo_acertos' | 'acertos_pendentes' | 'historico_acertos_pendentes' | 'dividas_historico' | 'extrato_suporte' | 'extrato_seguranca' | 'extrato_financeiro'

const ABAS: Tab[] = ['lancamentos', 'taxas', 'resumo_acertos', 'acertos_pendentes', 'historico_acertos_pendentes', 'dividas_historico', 'extrato_suporte', 'extrato_seguranca', 'extrato_financeiro']

function tabDaUrl(valor: string | null): Tab | null {
  return (ABAS as string[]).includes(valor ?? '') ? (valor as Tab) : null
}

// Referências estáveis pro `origens` do ExtratoView — mesmo motivo do
// ORIGENS_PADRAO em ExtratoView.tsx: um array literal recriado a cada
// render mudaria de identidade e disparava o load() em loop.
const ORIGENS_SUPORTE: ('suporte' | 'seguranca' | 'genia')[] = ['suporte']
const ORIGENS_SEGURANCA: ('suporte' | 'seguranca' | 'genia')[] = ['seguranca']
const ORIGENS_FINANCEIRO: ('suporte' | 'seguranca' | 'genia')[] = ['genia']

export function RelatoriosView() {
  const { t } = useI18n()
  const { hasPermission } = usePermissions()
  const searchParams = useSearchParams()

  // "relatorios" sozinho ainda dá acesso a Lançamentos (compatibilidade com
  // quem já tinha isso liberado); as chaves específicas servem pra dar
  // acesso só a um relatório — ex: CS só vê Lançamentos, sem abrir a tela de
  // Lançamento de verdade.
  const podeLancamentos = hasPermission('relatorios') || hasPermission('relatorios.lancamentos')
  // Resumo de Taxas NÃO herda de "relatorios" genérico de propósito — é
  // visão executiva cross-clube de dado sensível, só abre pra quem for
  // liberado explicitamente na chave própria (tela de Permissões).
  const podeTaxas = hasPermission('relatorios.taxas')
  // Mesma regra de relatorios.taxas — visão executiva cross-clube (todas as
  // Ligas de uma vez), só abre pra quem for liberado explicitamente.
  const podeResumoAcertos = hasPermission('relatorios.resumo_acertos')
  // Mesma regra — visão de cobrança cross-clube (quem deve/não pagou), só
  // abre pra quem for liberado explicitamente. Histórico de Acertos
  // Pendentes usa a MESMA chave — é o mesmo relatório, só numa tela própria
  // com filtros (não faz sentido liberar um sem o outro).
  const podeAcertosPendentes = hasPermission('relatorios.acertos_pendentes')
  // Extratos (Suporte/Segurança/Financeiro) são cópias só-consulta das
  // telas de mesmo nome em Lançamento/Segurança/Financeiro — mesma chave
  // de permissão de cada área (quem já acessa a tela de verdade também
  // acessa a cópia read-only aqui).
  const podeExtratoSuporte = hasPermission('lancamento')
  const podeExtratoSeguranca = hasPermission('seguranca')
  const podeExtratoFinanceiro = hasPermission('lancamento.genia')
  const primeiraPermitida: Tab | null = podeLancamentos ? 'lancamentos' : podeTaxas ? 'taxas' : podeResumoAcertos ? 'resumo_acertos' : podeAcertosPendentes ? 'acertos_pendentes' : podeExtratoSuporte ? 'extrato_suporte' : podeExtratoSeguranca ? 'extrato_seguranca' : podeExtratoFinanceiro ? 'extrato_financeiro' : null
  const ehPermitida = (aba: Tab) => aba === 'lancamentos' ? podeLancamentos
    : aba === 'taxas' ? podeTaxas
    : aba === 'resumo_acertos' ? podeResumoAcertos
    : aba === 'extrato_suporte' ? podeExtratoSuporte
    : aba === 'extrato_seguranca' ? podeExtratoSeguranca
    : aba === 'extrato_financeiro' ? podeExtratoFinanceiro
    : podeAcertosPendentes

  const [tab, setTab] = useState<Tab | null>(null)

  // Submenu da sidebar linka pra cá com ?tab=X — mesmo mecanismo de
  // Lançamento/Financeiro/Segurança (ver comentário lá e em Sidebar.tsx).
  useEffect(() => {
    const daUrl = tabDaUrl(searchParams.get('tab'))
    if (daUrl) setTab(daUrl)
  }, [searchParams])

  const abaAtiva = tab && ehPermitida(tab) ? tab : primeiraPermitida

  if (!abaAtiva) return null

  return (
    <div>
      {abaAtiva === 'lancamentos' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('relatorios.titulo_lancamentos')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_lancamentos')}</p>
          </div>
          <RelatorioLancamentos />
        </div>
      )}
      {abaAtiva === 'taxas' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('relatorios.titulo_taxas')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_taxas')}</p>
          </div>
          <RelatorioTaxas />
        </div>
      )}
      {abaAtiva === 'resumo_acertos' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('relatorios.titulo_resumo_acertos')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_resumo_acertos')}</p>
          </div>
          <RelatorioResumoAcertos />
        </div>
      )}
      {abaAtiva === 'acertos_pendentes' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('relatorios.titulo_acertos_pendentes')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_acertos_pendentes')}</p>
          </div>
          <RelatorioAcertosPendentes />
        </div>
      )}
      {abaAtiva === 'historico_acertos_pendentes' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('acertos_pendentes.historico_titulo')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_historico_acertos_pendentes')}</p>
          </div>
          <RelatorioHistoricoAcertosPendentes />
        </div>
      )}
      {abaAtiva === 'dividas_historico' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('dividas_historico.titulo')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('dividas_historico.subtitulo')}</p>
          </div>
          <RelatorioDividasHistorico />
        </div>
      )}
      {abaAtiva === 'extrato_suporte' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('relatorios.titulo_extrato_suporte')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_extrato_suporte')}</p>
          </div>
          <ExtratoView origens={ORIGENS_SUPORTE} permitirEdicao={false} />
        </div>
      )}
      {abaAtiva === 'extrato_seguranca' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('relatorios.titulo_extrato_seguranca')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_extrato_seguranca')}</p>
          </div>
          <ExtratoView origens={ORIGENS_SEGURANCA} mostrarCategoriaSeguranca permitirEdicao={false} />
        </div>
      )}
      {abaAtiva === 'extrato_financeiro' && (
        <div style={{ background: '#0C0E0B', minHeight: '100vh' }} className="space-y-6 p-4 md:p-10">
          <div>
            <h1 className="text-2xl font-semibold text-white">{t('relatorios.titulo_extrato_financeiro')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('relatorios.subtitulo_extrato_financeiro')}</p>
          </div>
          <ExtratoView origens={ORIGENS_FINANCEIRO} permitirEdicao={false} />
        </div>
      )}
    </div>
  )
}

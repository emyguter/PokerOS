'use client'
import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import { buscarImportsComAcerto, buscarPagamentosPorImport, corDiferenca, type ImportResumo, type AcertoPagamento } from '@/lib/pagamentos'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const COR_CLASSE: Record<ReturnType<typeof corDiferenca>, string> = {
  quitado: 'text-gray-400',
  azul: 'text-blue-400',
  vermelho: 'text-alert',
}

function formatImportLabel(i: ImportResumo) {
  return i.period_start ? `${i.period_start} → ${i.period_end || i.period_start}` : i.file_name
}

// Suporte vê os Envios segmentados (um pagamento por coluna) — é quem lança
// os pagamentos de verdade, precisa acompanhar cada remessa até quitar.
// Mesmos dados que CobrancaView (Financeiro), só a apresentação muda — ver
// lib/pagamentos.ts pra lógica compartilhada.
export function ControlePagamentosView() {
  const { t } = useI18n()
  const [imports, setImports] = useState<ImportResumo[]>([])
  const [importId, setImportId] = useState('')
  const [linhas, setLinhas] = useState<AcertoPagamento[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    buscarImportsComAcerto().then((lista) => {
      setImports(lista)
      if (lista[0]) setImportId(lista[0].id)
    })
  }, [])

  const load = useCallback(async (id: string) => {
    if (!id) { setLinhas([]); return }
    setLoading(true)
    setLinhas(await buscarPagamentosPorImport(id))
    setLoading(false)
  }, [])

  useEffect(() => { load(importId) }, [importId, load])

  const maxEnvios = linhas.reduce((max, l) => Math.max(max, l.envios.length), 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('pagamentos.titulo')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('pagamentos.subtitulo')}</p>
      </div>

      <div className="max-w-md">
        <label className="block text-xs text-gray-500 mb-1.5">{t('pagamentos.import')}</label>
        <select value={importId} onChange={(e) => setImportId(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
          {imports.length === 0 && <option value="">{t('pagamentos.nenhum_import')}</option>}
          {imports.map((i) => <option key={i.id} value={i.id}>{formatImportLabel(i)}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.carregando')}</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-gray-500 italic">{t('pagamentos.nenhum_acerto')}</p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface2 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2 whitespace-nowrap">{t('pagamentos.col_club_id')}</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">{t('pagamentos.col_club_name')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">{t('pagamentos.col_valor_acerto')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Caução lançada no período — só referência, não entra na Diferença (vive na própria conta dela).">Caução</th>
                {Array.from({ length: maxEnvios }).map((_, i) => (
                  <th key={i} className="text-right px-3 py-2 whitespace-nowrap">{t('pagamentos.col_envio', { n: String(i + 1) })}</th>
                ))}
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Soma dos Envios.">Total</th>
                <th className="text-right px-3 py-2 whitespace-nowrap" title="Do ponto de vista do clube: positivo = o clube vai receber; negativo = o clube precisa pagar.">{t('pagamentos.col_diferenca')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {linhas.map((l) => (
                <tr key={l.acerto_id}>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{l.club_external_id}</td>
                  <td className="px-3 py-2 text-white whitespace-nowrap">{l.club_name}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.valor_acerto)}</td>
                  <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{l.caucao === 0 ? '—' : fmt(l.caucao)}</td>
                  {Array.from({ length: maxEnvios }).map((_, i) => (
                    <td key={i} className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{l.envios[i] ? fmt(l.envios[i].valor_assinado) : '—'}</td>
                  ))}
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.valor_pago)}</td>
                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${COR_CLASSE[corDiferenca(l.diferenca)]}`}>{fmt(l.diferenca)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

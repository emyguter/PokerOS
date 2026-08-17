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

// Financeiro vê o total pago, não cada Envio individual — mesmos dados que
// ControlePagamentosView (Suporte), só que somados. A cor da Diferença é
// invertida em relação ao Suporte: aqui é do ponto de vista da liga (o que a
// liga precisa pagar/receber), não do clube — ver corDiferenca em
// lib/pagamentos.ts.
export function CobrancaView() {
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('cobranca.titulo')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('cobranca.subtitulo')}</p>
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
                <th className="text-right px-3 py-2 whitespace-nowrap">{t('pagamentos.col_valor_pago')}</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">{t('pagamentos.col_diferenca')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {linhas.map((l) => (
                <tr key={l.acerto_id}>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{l.club_external_id}</td>
                  <td className="px-3 py-2 text-white whitespace-nowrap">{l.club_name}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.valor_acerto)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmt(l.valor_pago)}</td>
                  <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${COR_CLASSE[corDiferenca(l.diferenca, 'financeiro')]}`}>{fmt(l.diferenca)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

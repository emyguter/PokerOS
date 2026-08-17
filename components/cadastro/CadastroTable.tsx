'use client'
import { Pencil, Trash2, RotateCcw, Copy } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface Column { key: string; label: string; render?: (value: any, row: any) => React.ReactNode }
interface Props {
  columns: Column[]
  data: any[]
  loading: boolean
  onEdit: (item: any) => void
  onDelete: (item: any) => void
  // Linha "inativa" troca o ícone de excluir por um de reativar (mesmo
  // onDelete — quem chama decide, pelo item, se é pra desativar ou reativar).
  isInactive?: (item: any) => boolean
  // Botão extra de "duplicar" — opcional, só aparece se quem chama passar.
  // Usado em Regras: duplicar cria uma cópia sem vínculo nenhum, que pode
  // ter o tipo trocado livremente (a original, já vinculada, não pode mais).
  onDuplicate?: (item: any) => void
}

export function CadastroTable({ columns, data, loading, onEdit, onDelete, isInactive, onDuplicate }: Props) {
  const { t } = useI18n()
  if (loading) return <div className="rounded-xl border border-white/10 p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
  if (data.length === 0) return <div className="rounded-xl border border-white/10 p-8 text-center text-gray-500 text-sm">{t('common.nenhum_registro')}</div>
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-surface2">
            {columns.map(col => <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{col.label}</th>)}
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('common.acoes')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const inativa = isInactive?.(row) ?? false
            return (
              <tr key={row.id ?? i} className={`border-b border-white/5 hover:bg-white/[0.03] transition-colors ${inativa ? 'opacity-50' : ''}`}>
                {columns.map(col => <td key={col.key} className="px-4 py-3 text-gray-300">{col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}</td>)}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {onDuplicate && (
                      <button onClick={() => onDuplicate(row)} title="Duplicar" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><Copy size={14} /></button>
                    )}
                    <button onClick={() => onEdit(row)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><Pencil size={14} /></button>
                    {inativa ? (
                      <button onClick={() => onDelete(row)} title="Reativar" className="p-1.5 rounded-lg text-gray-400 hover:text-success hover:bg-success/10 transition-colors"><RotateCcw size={14} /></button>
                    ) : (
                      <button onClick={() => onDelete(row)} className="p-1.5 rounded-lg text-gray-400 hover:text-alert hover:bg-alert/10 transition-colors"><Trash2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

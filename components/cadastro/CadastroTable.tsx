'use client'
import { Pencil, Trash2 } from 'lucide-react'

interface Column { key: string; label: string; render?: (value: any, row: any) => React.ReactNode }
interface Props { columns: Column[]; data: any[]; loading: boolean; onEdit: (item: any) => void; onDelete: (item: any) => void }

export function CadastroTable({ columns, data, loading, onEdit, onDelete }: Props) {
  if (loading) return <div className="rounded-xl border border-white/10 p-8 text-center text-gray-500 text-sm">Carregando...</div>
  if (data.length === 0) return <div className="rounded-xl border border-white/10 p-8 text-center text-gray-500 text-sm">Nenhum registro. Clique em "Novo" para adicionar.</div>
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-surface2">
            {columns.map(col => <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{col.label}</th>)}
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.id ?? i} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
              {columns.map(col => <td key={col.key} className="px-4 py-3 text-gray-300">{col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}</td>)}
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => onEdit(row)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => onDelete(row)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
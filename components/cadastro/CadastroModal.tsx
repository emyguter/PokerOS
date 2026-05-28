'use client'
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
interface FieldOption { value: string; label: string }
interface Field { key: string; label: string; type: 'text' | 'number' | 'select'; required?: boolean; placeholder?: string; options?: FieldOption[] }
interface Props { open: boolean; title: string; onClose: () => void; onSave: (data: any) => void; saving: boolean; initialData: Record<string, any>; fields: Field[] }
export function CadastroModal({ open, title, onClose, onSave, saving, initialData, fields }: Props) {
  const [form, setForm] = useState<Record<string, any>>(initialData)
  useEffect(() => { setForm(initialData) }, [initialData, open])
  if (!open) return null
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])))
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {fields.map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">{field.label}{field.required && <span className="text-gold ml-1">*</span>}</label>
              {field.type === 'select'
                ? <select value={form[field.key] ?? ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} required={field.required} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
                    {field.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                : <input type={field.type} value={form[field.key] ?? ''} onChange={e => setForm({ ...form, [field.key]: field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value })} required={field.required} placeholder={field.placeholder} step={field.type === 'number' ? 'any' : undefined} className="w-full bg-surface2 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50" />
              }
            </div>
          ))}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { League, LeagueForm, SuperLeague, Plataforma } from '@/lib/types'
import { MOEDAS } from '@/lib/moedas'
import { supabase } from '@/lib/supabase'
import { RegrasAplicadas } from './RegrasAplicadas'
import { BuscaSelect } from '@/components/BuscaSelect'
import { useI18n } from '@/lib/i18n'

interface Props {
  open: boolean
  editing: League | null
  superLeagues: SuperLeague[]
  plataformas: Plataforma[]
  onClose: () => void
  onSave: (form: LeagueForm) => void
  saving: boolean
  error?: string | null
}

const EMPTY: LeagueForm = {
  name: '', moeda: 'BRL', taxa_app_pct: null, ratio: null, super_league_id: null,
  plataforma_id: null, clube_ext_id: null, clube_nickname: null,
  operador_ext_id: null, operador_nickname: null,
  projeto: null,
}

const inputCls = 'w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/20'

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">{title}</h3>
      {children}
    </div>
  )
}

function Fld({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}{required && <span className="text-gray-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

export function LeagueModal({ open, editing, superLeagues, plataformas, onClose, onSave, saving, error }: Props) {
  const { t } = useI18n()
  const [form, setForm] = useState<LeagueForm>(EMPTY)
  // Só pra decidir o placeholder do campo abaixo — não trava o input (ao
  // contrário do Cadastro de Clube): aqui o cadastro manda sempre que
  // preenchido, a Regra vinculada só entra se deixar em branco.
  const [temRegraTaxaLiga, setTemRegraTaxaLiga] = useState(false)

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name, moeda: editing.moeda, taxa_app_pct: editing.taxa_app_pct,
        ratio: editing.ratio, super_league_id: editing.super_league_id,
        plataforma_id: editing.plataforma_id ?? null,
        clube_ext_id: editing.clube_ext_id ?? null,
        clube_nickname: editing.clube_nickname ?? null,
        operador_ext_id: editing.operador_ext_id ?? null,
        operador_nickname: editing.operador_nickname ?? null,
        projeto: editing.projeto ?? null,
      })
      supabase.from('regra_entidades').select('id', { count: 'exact', head: true })
        .eq('entidade_tipo', 'liga').eq('entidade_id', editing.id).eq('campo', 'taxa_liga')
        .then(({ count }) => setTemRegraTaxaLiga((count ?? 0) > 0))
    } else {
      setForm(EMPTY)
      setTemRegraTaxaLiga(false)
    }
  }, [editing, open])

  if (!open) return null

  const set = (k: keyof LeagueForm, v: any) => setForm(f => ({ ...f, [k]: v }))


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-white/10 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-semibold text-white">{editing ? t('league_modal.title_edit') : t('league_modal.title_new')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

            <Sec title={t('league_modal.identificacao_titulo')}>
              <Fld label={t('league_modal.nome_label')} required>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required placeholder={t('league_modal.nome_placeholder')} className={inputCls} />
              </Fld>
              <div className="grid grid-cols-2 gap-4">
                <Fld label={t('league_modal.superliga_label')}>
                  <BuscaSelect
                    value={form.super_league_id ?? ''}
                    onChange={v => set('super_league_id', v || null)}
                    opcoes={superLeagues.map(sl => ({ id: sl.id, nome: sl.name }))}
                    vazio={t('league_modal.superliga_vazio')}
                    className={inputCls}
                  />
                </Fld>
                <Fld label={t('league_modal.moeda_label')}>
                  <select value={form.moeda ?? 'BRL'} onChange={e => set('moeda', e.target.value)} className={inputCls}>
                    {MOEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </Fld>
              </div>
              <Fld label={t('league_modal.projeto_opcional')}>
                <input type="text" value={form.projeto ?? ''} onChange={e => set('projeto', e.target.value || null)} placeholder={t('league_modal.projeto_placeholder')} className={inputCls} />
              </Fld>
            </Sec>

            <Sec title={t('league_modal.identificacao_importacao_titulo')}>
              <p className="text-xs text-gray-500">{t('league_modal.identificacao_importacao_desc')}</p>
              <Fld label={t('league_modal.plataforma_app_label')}>
                <select value={form.plataforma_id ?? ''} onChange={e => set('plataforma_id', e.target.value || null)} className={inputCls}>
                  <option value="">{t('league_modal.selecione')}</option>
                  {plataformas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Fld>
              <div className="grid grid-cols-2 gap-3">
                <Fld label={t('league_modal.id_liga_label')}>
                  <input
                    type="text"
                    value={form.clube_ext_id ?? ''}
                    onChange={e => set('clube_ext_id', e.target.value || null)}
                    placeholder={t('league_modal.id_liga_placeholder')}
                    className={inputCls}
                  />
                </Fld>
                <Fld label={t('league_modal.nome_liga_arquivo_label')}>
                  <input
                    type="text"
                    value={form.clube_nickname ?? ''}
                    onChange={e => set('clube_nickname', e.target.value || null)}
                    placeholder={t('league_modal.nome_liga_arquivo_placeholder')}
                    className={inputCls}
                  />
                </Fld>
              </div>
            </Sec>

            <Sec title={t('league_modal.taxa_liga_titulo')}>
              <Fld label={t('league_modal.taxa_liga_pct_label')}>
                <input
                  type="number" step="any" value={form.taxa_app_pct ?? ''}
                  onChange={e => set('taxa_app_pct', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder={temRegraTaxaLiga ? t('league_modal.taxa_liga_placeholder_regra') : t('league_modal.taxa_liga_placeholder_livre')} className={inputCls}
                />
              </Fld>
              <p className="text-xs text-gray-500">
                {t('league_modal.taxa_liga_desc')}
              </p>
              <RegrasAplicadas entidadeTipo="liga" entidadeId={editing?.id ?? null} />
            </Sec>

          </div>

          {error && (
            <div className="shrink-0 mx-6 mb-4 p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>
          )}

          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors">{t('common.cancelar')}</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}{t('league_modal.submit_label')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
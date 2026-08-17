'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { BuscaSelect } from '@/components/BuscaSelect'
import { LIMITES_VIP, TIPOS_VIP, corVip, type TipoVip } from '@/lib/vip'
import { ConfirmVipLimiteModal } from './ConfirmVipLimiteModal'

interface ClubeOpcao { id: string; name: string; external_id: string | null }

interface VipLancamento {
  id: string
  clube_id: string
  tipo: TipoVip
  data_lancamento: string
  observacao: string | null
  clubs: { name: string; external_id: string | null } | null
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function mesAtual() {
  return new Date().toISOString().slice(0, 7)
}

// Primeiro e último dia (YYYY-MM-DD) do mês "YYYY-MM".
function limitesMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10)
  return { inicio, fim }
}

const ROW_COR: Record<ReturnType<typeof corVip>, string> = {
  vermelho: 'bg-alert/10 hover:bg-alert/15',
  amarelo: 'bg-yellow-400/10 hover:bg-yellow-400/15',
  branco: 'hover:bg-white/[0.03]',
}

const BADGE_COR: Record<ReturnType<typeof corVip>, string> = {
  vermelho: 'text-alert',
  amarelo: 'text-yellow-400',
  branco: 'text-gray-400',
}

export function VipView() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeOpcao[]>([])
  const [clubeId, setClubeId] = useState('')
  const [tipo, setTipo] = useState<TipoVip>('platinum')
  const [data, setData] = useState(hoje())
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoLimite, setConfirmandoLimite] = useState(false)

  const [mesFiltro, setMesFiltro] = useState(mesAtual())
  const [lancamentos, setLancamentos] = useState<VipLancamento[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('clubs').select('id, name, external_id').order('name').then(({ data }) => setClubes(data ?? []))
  }, [])

  const clubeSelecionado = clubes.find((c) => c.id === clubeId)

  const load = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = limitesMes(mesFiltro)
    const { data: rows } = await supabase
      .from('vips_enviados')
      .select('id, clube_id, tipo, data_lancamento, observacao, clubs(name, external_id)')
      .gte('data_lancamento', inicio)
      .lte('data_lancamento', fim)
      .order('data_lancamento', { ascending: true })
      .order('criado_em', { ascending: true })
    setLancamentos((rows ?? []) as unknown as VipLancamento[])
    setLoading(false)
  }, [mesFiltro])

  useEffect(() => { load() }, [load])

  // Total já enviado no mês em exibição, por clube+tipo — usado pra colorir
  // o extrato (cada linha reflete o total acumulado do clube naquele tipo).
  const totaisPorClubeTipo = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const l of lancamentos) {
      const chave = `${l.clube_id}:${l.tipo}`
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
    }
    return mapa
  }, [lancamentos])

  async function contarNoMes(clube: string, tp: TipoVip, dataRef: string): Promise<number> {
    const { inicio, fim } = limitesMes(dataRef.slice(0, 7))
    const { count } = await supabase
      .from('vips_enviados')
      .select('id', { count: 'exact', head: true })
      .eq('clube_id', clube)
      .eq('tipo', tp)
      .gte('data_lancamento', inicio)
      .lte('data_lancamento', fim)
    return count ?? 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clubeId) { setError(t('vip.escolha_clube')); return }
    setError(null)
    const atual = await contarNoMes(clubeId, tipo, data)
    if (atual >= LIMITES_VIP[tipo]) {
      setConfirmandoLimite(true)
      return
    }
    await criar()
  }

  async function criar() {
    setSaving(true); setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const { error: insErr } = await supabase.from('vips_enviados').insert({
        clube_id: clubeId,
        tipo,
        data_lancamento: data,
        observacao: observacao || null,
        criado_por: userData.user?.id ?? null,
      })
      if (insErr) throw insErr
      setObservacao('')
      setData(hoje())
      if (data.slice(0, 7) === mesFiltro) await load()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
      setConfirmandoLimite(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">{t('vip.titulo')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('vip.subtitulo')}</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-surface2 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.clube')}</label>
            <BuscaSelect value={clubeId} onChange={setClubeId} opcoes={clubes.map((c) => ({ id: c.id, nome: c.name }))} placeholder={t('common.selecione')} />
            {clubeSelecionado && <p className="text-xs text-gray-500 mt-1.5">{t('vip.id_clube')}: {clubeSelecionado.external_id ?? '—'}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('vip.tipo')}</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoVip)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
              {TIPOS_VIP.map((tp) => <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.data')}</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.descricao')}</label>
          <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder={t('vip.observacao_placeholder')} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>

        {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-gold text-surface rounded-lg text-sm font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('vip.lancar')}
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('vip.extrato_mensal')}</p>
        <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50" />
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
        ) : lancamentos.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.nenhum_registro')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-surface2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_data')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('lancamento.clube')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('vip.tipo')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('vip.no_mes')}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('extrato.col_descricao')}</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l) => {
                  const usados = totaisPorClubeTipo.get(`${l.clube_id}:${l.tipo}`) ?? 0
                  const cor = corVip(usados, LIMITES_VIP[l.tipo])
                  return (
                    <tr key={l.id} className={`border-b border-white/5 transition-colors ${ROW_COR[cor]}`}>
                      <td className="px-4 py-3 text-gray-400">{new Date(l.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-3 text-white">{l.clubs?.name ?? '—'} {l.clubs?.external_id && <span className="text-gray-500">(#{l.clubs.external_id})</span>}</td>
                      <td className="px-4 py-3 text-gray-300">{t(TIPOS_VIP.find((tp) => tp.value === l.tipo)?.labelKey ?? l.tipo)}</td>
                      <td className={`px-4 py-3 font-medium ${BADGE_COR[cor]}`}>{usados}/{LIMITES_VIP[l.tipo]}</td>
                      <td className="px-4 py-3 text-gray-400">{l.observacao || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmandoLimite && (
        <ConfirmVipLimiteModal
          saving={saving}
          onConfirm={criar}
          onCancel={() => setConfirmandoLimite(false)}
        />
      )}
    </div>
  )
}

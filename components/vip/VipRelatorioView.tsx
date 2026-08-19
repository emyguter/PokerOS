'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { BuscaSelect } from '@/components/BuscaSelect'
import { TIPOS_VIP, corVip, limiteVipDoClube, type TipoVip, type LimitesVipClube } from '@/lib/vip'

const TODOS_CLUBES = '__todos__'

interface ClubeRelatorio extends LimitesVipClube { id: string; name: string; external_id: string | null }

function mesAtual() {
  return new Date().toISOString().slice(0, 7)
}

function limitesMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10)
  return { inicio, fim }
}

const BADGE_COR: Record<ReturnType<typeof corVip>, string> = {
  vermelho: 'text-alert',
  amarelo: 'text-yellow-400',
  branco: 'text-gray-300',
}

// Quantos VIPs cada clube já solicitou no mês, por tipo — cross-clube, com
// filtro "Todos" pra visão executiva (pedido do Cássio: "saber quantos vips
// cada um já solicitou"). Mesmo padrão TODOS_CLUBES de ExtratoView.tsx.
export function VipRelatorioView() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeRelatorio[]>([])
  const [clubeId, setClubeId] = useState(TODOS_CLUBES)
  const [mesFiltro, setMesFiltro] = useState(mesAtual())
  const [contagens, setContagens] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('clubs').select('id, name, external_id, limite_vip_silver, limite_vip_black, limite_vip_platinum').eq('ativo', true).order('name').then(({ data }) => setClubes(data ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { inicio, fim } = limitesMes(mesFiltro)
    const { data } = await supabase
      .from('vips_enviados')
      .select('clube_id, tipo')
      .gte('data_lancamento', inicio)
      .lte('data_lancamento', fim)
    const mapa = new Map<string, number>()
    for (const row of (data ?? []) as { clube_id: string; tipo: TipoVip }[]) {
      const chave = `${row.clube_id}:${row.tipo}`
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
    }
    setContagens(mapa)
    setLoading(false)
  }, [mesFiltro])

  useEffect(() => { load() }, [load])

  const linhas = useMemo(
    () => clubeId === TODOS_CLUBES ? clubes : clubes.filter((c) => c.id === clubeId),
    [clubes, clubeId]
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs text-gray-500 mb-1.5">{t('lancamento.clube')}</label>
          <BuscaSelect
            value={clubeId}
            onChange={setClubeId}
            opcoes={[{ id: TODOS_CLUBES, nome: t('extrato.todos_clubes') }, ...clubes.map((c) => ({ id: c.id, nome: c.name }))]}
            placeholder={t('common.selecione')}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">{t('vip.no_mes')}</label>
          <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
        ) : linhas.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.nenhum_registro')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-surface2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('lancamento.clube')}</th>
                  {TIPOS_VIP.map((tp) => (
                    <th key={tp.value} className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t(tp.labelKey)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3 text-white whitespace-nowrap">{c.name} {c.external_id && <span className="text-gray-500">(#{c.external_id})</span>}</td>
                    {TIPOS_VIP.map((tp) => {
                      const enviados = contagens.get(`${c.id}:${tp.value}`) ?? 0
                      const limite = limiteVipDoClube(c, tp.value)
                      const falta = limite - enviados
                      const cor = corVip(enviados, limite)
                      return (
                        <td key={tp.value} className={`px-4 py-3 text-right font-medium whitespace-nowrap ${BADGE_COR[cor]}`}>
                          {enviados}/{limite || '—'}
                          {limite > 0 && (
                            <span className="block text-[11px] text-gray-500 font-normal">
                              {falta > 0 ? t('vip.faltam', { n: String(falta) }) : t('vip.excedeu')}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

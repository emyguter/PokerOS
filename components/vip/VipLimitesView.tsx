'use client'
import { useState, useEffect, useMemo } from 'react'
import { Loader2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { errMsg } from '@/lib/errors'
import { TIPOS_VIP, type TipoVip } from '@/lib/vip'

interface ClubeLimite {
  id: string
  name: string
  external_id: string | null
  limite_vip_silver: number | null
  limite_vip_black: number | null
  limite_vip_platinum: number | null
}

type Edicao = Record<TipoVip, string>

function paraEdicao(c: ClubeLimite): Edicao {
  return {
    silver: c.limite_vip_silver === null ? '' : String(c.limite_vip_silver),
    black: c.limite_vip_black === null ? '' : String(c.limite_vip_black),
    platinum: c.limite_vip_platinum === null ? '' : String(c.limite_vip_platinum),
  }
}

// Só admin (permissão vip.limites, não herdada de "vip") pode definir o
// máximo de cada clube por tipo — em branco = sem limite configurado (0,
// ver lib/vip.ts).
export function VipLimitesView() {
  const { t } = useI18n()
  const [clubes, setClubes] = useState<ClubeLimite[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({})
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [salvoId, setSalvoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('clubs')
      .select('id, name, external_id, limite_vip_silver, limite_vip_black, limite_vip_platinum')
      .eq('ativo', true)
      .order('name')
      .then(({ data }) => {
        const lista = data ?? []
        setClubes(lista)
        setEdicoes(Object.fromEntries(lista.map((c) => [c.id, paraEdicao(c)])))
        setLoading(false)
      })
  }, [])

  const clubesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return clubes
    return clubes.filter((c) => c.name.toLowerCase().includes(termo) || c.external_id?.toLowerCase().includes(termo))
  }, [clubes, busca])

  function setCampo(clubeId: string, tipo: TipoVip, valor: string) {
    if (valor !== '' && !/^\d*$/.test(valor)) return
    setEdicoes((prev) => ({ ...prev, [clubeId]: { ...prev[clubeId], [tipo]: valor } }))
    setSalvoId(null)
  }

  async function salvar(clubeId: string) {
    const edicao = edicoes[clubeId]
    setSalvandoId(clubeId); setError(null)
    try {
      const { error: updErr } = await supabase
        .from('clubs')
        .update({
          limite_vip_silver: edicao.silver === '' ? null : Number(edicao.silver),
          limite_vip_black: edicao.black === '' ? null : Number(edicao.black),
          limite_vip_platinum: edicao.platinum === '' ? null : Number(edicao.platinum),
        })
        .eq('id', clubeId)
      if (updErr) throw updErr
      setSalvoId(clubeId)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSalvandoId(null)
    }
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={t('vip.buscar_clube')}
        className="w-full md:w-80 bg-surface border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
      />

      {error && <div className="p-3 bg-alert/10 border border-alert/30 rounded-lg text-alert text-sm">{error}</div>}

      <div className="rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.carregando')}</div>
        ) : clubesFiltrados.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">{t('common.nenhum_registro')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-surface2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('lancamento.clube')}</th>
                  {TIPOS_VIP.map((tp) => (
                    <th key={tp.value} className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t(tp.labelKey)}</th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {clubesFiltrados.map((c) => {
                  const edicao = edicoes[c.id]
                  if (!edicao) return null
                  return (
                    <tr key={c.id} className="border-b border-white/5">
                      <td className="px-4 py-3 text-white whitespace-nowrap">{c.name} {c.external_id && <span className="text-gray-500">(#{c.external_id})</span>}</td>
                      {TIPOS_VIP.map((tp) => (
                        <td key={tp.value} className="px-4 py-3 text-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={edicao[tp.value]}
                            onChange={(e) => setCampo(c.id, tp.value, e.target.value)}
                            placeholder="—"
                            className="w-16 bg-surface border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-gold/50"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => salvar(c.id)}
                          disabled={salvandoId === c.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 text-gold border border-gold/30 rounded-lg text-xs font-semibold hover:bg-gold/20 disabled:opacity-50 transition-colors ml-auto"
                        >
                          {salvandoId === c.id ? <Loader2 size={12} className="animate-spin" /> : salvoId === c.id ? <Check size={12} /> : null}
                          {t('common.salvar')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

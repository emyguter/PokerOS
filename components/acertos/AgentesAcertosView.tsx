'use client'
import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface AcertoAgenteRow {
  id: string
  agente_id: string
  agente_nome: string
  clube_id: string | null
  clube_nome: string | null
  rake_total: number
  rakeback_pct: number
  valor_rakeback: number
  imports: { period_start: string | null; period_end: string | null } | null
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function AgentesAcertosView({ agenteIdFixo }: { agenteIdFixo?: string } = {}) {
  const [rows, setRows] = useState<AcertoAgenteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<Set<string>>(new Set(agenteIdFixo ? [agenteIdFixo] : []))

  useEffect(() => {
    setLoading(true)
    let query = supabase
      .from('acertos_agentes')
      .select('id, agente_id, agente_nome, clube_id, clube_nome, rake_total, rakeback_pct, valor_rakeback, imports(period_start, period_end)')
      .order('agente_nome')
    if (agenteIdFixo) query = query.eq('agente_id', agenteIdFixo)
    query.then(({ data }) => {
      setRows((data ?? []) as unknown as AcertoAgenteRow[])
      setLoading(false)
    })
  }, [agenteIdFixo])

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      const p = r.imports?.period_start
      if (dataInicio && (!p || p < dataInicio)) return false
      if (dataFim && (!p || p > dataFim)) return false
      if (busca && !r.agente_nome.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [rows, dataInicio, dataFim, busca])

  const porAgente = useMemo(() => {
    const mapa = new Map<string, { agente_id: string; agente_nome: string; rake_total: number; valor_rakeback: number; clubes: Map<string, { clube_nome: string; rake_total: number; rakeback_pct: number; valor_rakeback: number }> }>()
    for (const r of filtradas) {
      const ag = mapa.get(r.agente_id) ?? { agente_id: r.agente_id, agente_nome: r.agente_nome, rake_total: 0, valor_rakeback: 0, clubes: new Map() }
      ag.rake_total += r.rake_total
      ag.valor_rakeback += r.valor_rakeback
      const chaveClube = r.clube_id ?? 'sem_clube'
      const cl = ag.clubes.get(chaveClube) ?? { clube_nome: r.clube_nome ?? '— sem clube —', rake_total: 0, rakeback_pct: r.rakeback_pct, valor_rakeback: 0 }
      cl.rake_total += r.rake_total
      cl.valor_rakeback += r.valor_rakeback
      ag.clubes.set(chaveClube, cl)
      mapa.set(r.agente_id, ag)
    }
    return [...mapa.values()].sort((a, b) => b.valor_rakeback - a.valor_rakeback)
  }, [filtradas])

  const totalGeral = porAgente.reduce((s, a) => s + a.valor_rakeback, 0)

  function toggle(id: string) {
    setExpandido((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div style={{ maxWidth: 1300 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {!agenteIdFixo && (
          <div>
            <p style={{ fontSize: 11, color: '#5a5a52', marginBottom: 4 }}>Buscar agente</p>
            <input type="text" placeholder="Nome do agente..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        )}
        <div>
          <p style={{ fontSize: 11, color: '#5a5a52', marginBottom: 4 }}>De</p>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="date-input" />
        </div>
        <div>
          <p style={{ fontSize: 11, color: '#5a5a52', marginBottom: 4 }}>Até</p>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="date-input" />
        </div>
        <div className="stat" style={{ padding: '10px 20px' }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5a5a52', margin: '0 0 4px' }}>Total Rakeback</p>
          <p style={{ fontSize: 20, fontWeight: 600, color: '#C9A84C', margin: 0 }}>{fmt(totalGeral)}</p>
        </div>
      </div>

      <style>{`.date-input{background:#111410;color:#F0EDE4;border:1px solid #2a2c20;border-radius:8px;padding:8px 12px;font-family:var(--font-sans),sans-serif;font-size:13px;outline:none}.date-input:focus{border-color:#C9A84C}`}</style>

      {loading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#5a5a52' }}>Carregando...</div>
      ) : porAgente.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: '#5a5a52', fontSize: 13 }}>Nenhum acerto de agente calculado ainda nesse período. Calcule os acertos de um import na aba &quot;Por Clube&quot; primeiro.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {porAgente.map((a) => {
            const aberto = expandido.has(a.agente_id)
            return (
              <div key={a.agente_id} style={{ borderBottom: '1px solid #151710' }}>
                <button
                  onClick={() => toggle(a.agente_id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {aberto ? <ChevronUp size={14} color="#7a7a70" /> : <ChevronDown size={14} color="#7a7a70" />}
                    <div>
                      <p style={{ color: '#C9A84C', fontSize: 14, margin: 0 }}>{a.agente_nome}</p>
                      <p style={{ color: '#5a5a52', fontSize: 11, margin: '2px 0 0' }}>{a.clubes.size} clube{a.clubes.size !== 1 ? 's' : ''} · Rake {fmt(a.rake_total)}</p>
                    </div>
                  </div>
                  <p style={{ color: '#7DC97D', fontSize: 16, fontWeight: 600, margin: 0 }}>{fmt(a.valor_rakeback)}</p>
                </button>
                {aberto && (
                  <table style={{ marginBottom: 4 }}>
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 40 }}>Clube</th>
                        <th style={{ textAlign: 'right' }}>Rake</th>
                        <th style={{ textAlign: 'right' }}>%</th>
                        <th style={{ textAlign: 'right' }}>Rakeback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...a.clubes.values()].map((c) => (
                        <tr key={c.clube_nome}>
                          <td style={{ paddingLeft: 40, color: '#d0cdc5' }}>{c.clube_nome}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(c.rake_total)}</td>
                          <td style={{ textAlign: 'right', color: '#7a7a70' }}>{fmt(c.rakeback_pct)}%</td>
                          <td style={{ textAlign: 'right', color: '#7DC97D' }}>{fmt(c.valor_rakeback)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

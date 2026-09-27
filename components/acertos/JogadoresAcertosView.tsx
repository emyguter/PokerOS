'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

interface ImportJogadorRow {
  jogador_id: string
  clube_id: string | null
  agente_id: string | null
  rake_total: number
  player_result: number
  jogadores: { nome: string } | null
  clubs: { name: string } | null
  agentes: { nome: string } | null
  imports: { period_start: string | null; period_end: string | null } | null
}

interface JogadorAgregado {
  jogador_id: string
  jogador_nome: string
  clubes: Set<string>
  agentes: Set<string>
  rake_total: number
  player_result: number
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PAGE_SIZE = 50

// Sub-menu "Jogadores" dentro de Acertos (pedido do Cássio, junto com Super
// Agentes/Agentes) — visão cruzando todos os clubes, fonte diferente da
// tabela de Agentes (import_jogadores, que tem granularidade por jogador;
// acertos_agentes só soma por Agente). Lista tudo com paginação (cliente),
// igual pedido: muitos jogadores, mas sem exigir busca antes de listar.
export function JogadoresAcertosView() {
  const { t } = useI18n()
  const [rows, setRows] = useState<ImportJogadorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('import_jogadores')
      .select('jogador_id, clube_id, agente_id, rake_total, player_result, jogadores(nome), clubs(name), agentes(nome), imports(period_start, period_end)')
      .then(({ data }) => {
        setRows((data ?? []) as unknown as ImportJogadorRow[])
        setLoading(false)
      })
  }, [])

  const filtradas = useMemo(() => {
    return rows.filter((r) => {
      const p = r.imports?.period_start
      if (dataInicio && (!p || p < dataInicio)) return false
      if (dataFim && (!p || p > dataFim)) return false
      if (busca && !(r.jogadores?.nome ?? '').toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [rows, dataInicio, dataFim, busca])

  const porJogador = useMemo(() => {
    const mapa = new Map<string, JogadorAgregado>()
    for (const r of filtradas) {
      const jg = mapa.get(r.jogador_id) ?? { jogador_id: r.jogador_id, jogador_nome: r.jogadores?.nome ?? t('jogadores_acertos_view.sem_nome'), clubes: new Set<string>(), agentes: new Set<string>(), rake_total: 0, player_result: 0 }
      jg.rake_total += r.rake_total ?? 0
      jg.player_result += r.player_result ?? 0
      if (r.clubs?.name) jg.clubes.add(r.clubs.name)
      if (r.agentes?.nome) jg.agentes.add(r.agentes.nome)
      mapa.set(r.jogador_id, jg)
    }
    return [...mapa.values()].sort((a, b) => b.rake_total - a.rake_total)
  }, [filtradas, t])

  useEffect(() => { setPagina(1) }, [dataInicio, dataFim, busca])

  const totalPaginas = Math.max(1, Math.ceil(porJogador.length / PAGE_SIZE))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = porJogador.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE)
  const rakeTotalGeral = porJogador.reduce((s, j) => s + j.rake_total, 0)

  return (
    <div style={{ maxWidth: 1300 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: 11, color: '#5a5a52', marginBottom: 4 }}>{t('jogadores_acertos_view.buscar_jogador_label')}</p>
          <input type="text" placeholder={t('jogadores_acertos_view.buscar_jogador_placeholder')} value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div>
          <p style={{ fontSize: 11, color: '#5a5a52', marginBottom: 4 }}>{t('agentes_acertos_view.de_label')}</p>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="date-input" />
        </div>
        <div>
          <p style={{ fontSize: 11, color: '#5a5a52', marginBottom: 4 }}>{t('agentes_acertos_view.ate_label')}</p>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="date-input" />
        </div>
        <div className="stat" style={{ padding: '10px 20px' }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#5a5a52', margin: '0 0 4px' }}>{t('jogadores_acertos_view.rake_total_label')}</p>
          <p style={{ fontSize: 20, fontWeight: 600, color: '#C9A84C', margin: 0 }}>{fmt(rakeTotalGeral)}</p>
        </div>
      </div>

      <style>{`.date-input{background:#111410;color:#F0EDE4;border:1px solid #2a2c20;border-radius:8px;padding:8px 12px;font-family:var(--font-sans),sans-serif;font-size:13px;outline:none}.date-input:focus{border-color:#C9A84C}`}</style>

      {loading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#5a5a52' }}>{t('common.carregando')}</div>
      ) : porJogador.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ color: '#5a5a52', fontSize: 13 }}>{t('jogadores_acertos_view.nenhum_jogador_desc')}</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('jogadores_acertos_view.col_jogador')}</th>
                  <th>{t('jogadores_acertos_view.col_clube')}</th>
                  <th>{t('jogadores_acertos_view.col_agente')}</th>
                  <th style={{ textAlign: 'right' }}>{t('jogadores_acertos_view.col_rake')}</th>
                  <th style={{ textAlign: 'right' }}>{t('jogadores_acertos_view.col_resultado')}</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((j) => (
                  <tr key={j.jogador_id}>
                    <td style={{ color: '#C9A84C' }}>{j.jogador_nome}</td>
                    <td style={{ color: '#d0cdc5' }}>{[...j.clubes].join(', ') || '—'}</td>
                    <td style={{ color: '#d0cdc5' }}>{[...j.agentes].join(', ') || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(j.rake_total)}</td>
                    <td style={{ textAlign: 'right', color: j.player_result >= 0 ? '#7DC97D' : '#D97676' }}>{fmt(j.player_result)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaAtual <= 1}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2c20', background: 'none', color: '#d0cdc5', cursor: paginaAtual <= 1 ? 'not-allowed' : 'pointer', opacity: paginaAtual <= 1 ? 0.4 : 1 }}
            >
              {t('jogadores_acertos_view.pagina_anterior')}
            </button>
            <span style={{ fontSize: 13, color: '#5a5a52' }}>{t('jogadores_acertos_view.pagina_contador', { atual: paginaAtual, total: totalPaginas })}</span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual >= totalPaginas}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2c20', background: 'none', color: '#d0cdc5', cursor: paginaAtual >= totalPaginas ? 'not-allowed' : 'pointer', opacity: paginaAtual >= totalPaginas ? 0.4 : 1 }}
            >
              {t('jogadores_acertos_view.proxima_pagina')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

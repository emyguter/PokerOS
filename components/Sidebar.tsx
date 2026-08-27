'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, Upload, FileText, LogOut, ShieldCheck, ShieldAlert, Wallet, Receipt, PanelLeftClose, PanelLeftOpen, HandCoins, ListChecks, Landmark, Gauge, Banknote, Menu, X, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

const CADASTRO_CHAVES = ['cadastro.mega_ligas', 'cadastro.superligas', 'cadastro.ligas', 'cadastro.clubes', 'cadastro.super_agentes', 'cadastro.agentes', 'cadastro.jogadores']
const COLLAPSED_KEY = 'pokeros_sidebar_collapsed'

interface SubNavItem { key: string; labelKey: string; href: string; chave?: string | string[]; subItems?: SubNavItem[] }

// Mesmas 8 telas do menu interno de Cadastros (app/admin/cadastro/layout.tsx)
// — aqui só pra dar atalho direto pela sidebar, o menu interno continua igual.
const CADASTRO_SUB: SubNavItem[] = [
  { key: 'mega_ligas', labelKey: 'cadastro_menu.mega_ligas', href: '/admin/cadastro/mega-ligas', chave: 'cadastro.mega_ligas' },
  { key: 'superligas', labelKey: 'cadastro_menu.superligas', href: '/admin/cadastro/superligas', chave: 'cadastro.superligas' },
  { key: 'ligas', labelKey: 'cadastro_menu.ligas', href: '/admin/cadastro/ligas', chave: 'cadastro.ligas' },
  { key: 'clubes', labelKey: 'cadastro_menu.clubes', href: '/admin/cadastro/clubes', chave: 'cadastro.clubes' },
  { key: 'super_agentes', labelKey: 'cadastro_menu.super_agentes', href: '/admin/cadastro/super-agentes', chave: 'cadastro.super_agentes' },
  { key: 'agentes', labelKey: 'cadastro_menu.agentes', href: '/admin/cadastro/agentes', chave: 'cadastro.agentes' },
  { key: 'jogadores', labelKey: 'cadastro_menu.jogadores', href: '/admin/cadastro/jogadores', chave: 'cadastro.jogadores' },
]

// Mesmas abas de dentro de Lançamento/Financeiro/Segurança (LancamentoView,
// FinanceiroView, SegurancaView) — o `?tab=` é lido por cada view via
// useSearchParams (ver useEffect em cada arquivo), não aqui na Sidebar: ela
// renderiza em toda página (via app/layout.tsx), então usar o hook aqui
// forçaria TODA página do app pra fora da renderização estática.
// VIP Cards (subitem com sub-subitens Lançar/Configurar Limites) e Acertos
// Pendentes entraram aqui dentro da reorganização de menus — extrato saiu
// daqui e foi pra dentro de Relatórios (ver RELATORIOS_SUB), junto com o
// Relatório de VIP Cards.
const LANCAMENTO_SUB: SubNavItem[] = [
  { key: 'lancar', labelKey: 'lancamento.aba_lancar', href: '/lancamento?tab=lancar' },
  { key: 'pendencias', labelKey: 'lancamento.aba_pendencias', href: '/lancamento?tab=pendencias' },
  { key: 'pagamentos', labelKey: 'lancamento.aba_pagamentos', href: '/lancamento?tab=pagamentos' },
  { key: 'extra', labelKey: 'lancamento.aba_extra', href: '/lancamento?tab=extra' },
  { key: 'conferencia', labelKey: 'lancamento.aba_conferencia', href: '/lancamento?tab=conferencia' },
  {
    key: 'vip', labelKey: 'vip.menu_suporte_grupo', href: '/vip?tab=lancamento', chave: ['vip', 'vip.limites'],
    subItems: [
      { key: 'lancamento', labelKey: 'vip.aba_lancamento', href: '/vip?tab=lancamento', chave: 'vip' },
      { key: 'limites', labelKey: 'vip.aba_limites', href: '/vip?tab=limites', chave: 'vip.limites' },
    ],
  },
  { key: 'acertos_pendentes', labelKey: 'relatorios.aba_acertos_pendentes', href: '/relatorios?tab=acertos_pendentes', chave: 'relatorios.acertos_pendentes' },
]
const FINANCEIRO_SUB: SubNavItem[] = [
  { key: 'lancar', labelKey: 'lancamento.aba_lancar', href: '/financeiro?tab=lancar' },
  { key: 'pendencias', labelKey: 'lancamento.aba_pendencias', href: '/financeiro?tab=pendencias' },
  { key: 'conciliacao', labelKey: 'lancamento.aba_conciliacao', href: '/financeiro?tab=conciliacao', chave: 'conciliacao' },
  { key: 'cobranca', labelKey: 'lancamento.aba_cobranca', href: '/financeiro?tab=cobranca' },
]
const SEGURANCA_SUB: SubNavItem[] = [
  { key: 'lancar', labelKey: 'lancamento.aba_lancar', href: '/seguranca?tab=lancar' },
]
// "relatorios" genérico dá acesso a Lançamentos (compatibilidade — mesma
// regra de RelatoriosView); Resumo de Taxas não herda dele de propósito, só
// abre com a chave própria. O Relatório de Stoploss e o "VIP Cards" vieram
// de seus menus originais na reorganização — mesma rota/tela de sempre, só
// o link mudou de lugar na sidebar. Os Extratos (Suporte/Segurança/
// Stoploss/Financeiro) viraram uma pasta só, "Extratos", com um
// sub-subitem por origem.
const RELATORIOS_SUB: SubNavItem[] = [
  { key: 'lancamentos', labelKey: 'relatorios.aba_lancamentos', href: '/relatorios?tab=lancamentos', chave: ['relatorios', 'relatorios.lancamentos'] },
  { key: 'taxas', labelKey: 'relatorios.aba_taxas', href: '/relatorios?tab=taxas', chave: 'relatorios.taxas' },
  { key: 'resumo_acertos', labelKey: 'relatorios.aba_resumo_acertos', href: '/relatorios?tab=resumo_acertos', chave: 'relatorios.resumo_acertos' },
  { key: 'historico_acertos_pendentes', labelKey: 'relatorios.aba_historico_acertos_pendentes', href: '/relatorios?tab=historico_acertos_pendentes', chave: 'relatorios.acertos_pendentes' },
  { key: 'stoploss', labelKey: 'relatorios.aba_stoploss', href: '/stoploss?tab=relatorio' },
  { key: 'vip_relatorio', labelKey: 'vip.menu_relatorios', href: '/vip?tab=relatorio', chave: 'vip.relatorio' },
  {
    key: 'extratos', labelKey: 'relatorios.menu_extratos', href: '/lancamento?tab=extrato', chave: ['lancamento', 'seguranca', 'stoploss', 'lancamento.genia'],
    subItems: [
      { key: 'extrato_suporte', labelKey: 'relatorios.extrato_suporte', href: '/lancamento?tab=extrato', chave: 'lancamento' },
      { key: 'extrato_seguranca', labelKey: 'relatorios.extrato_seguranca', href: '/seguranca?tab=extrato', chave: 'seguranca' },
      { key: 'extrato_stoploss', labelKey: 'relatorios.extrato_stoploss', href: '/stoploss?tab=extrato', chave: 'stoploss' },
      { key: 'extrato_financeiro', labelKey: 'relatorios.extrato_financeiro', href: '/financeiro?tab=extrato', chave: 'lancamento.genia' },
    ],
  },
]
const STOPLOSS_SUB: SubNavItem[] = [
  { key: 'resumo', labelKey: 'stoploss.aba_resumo', href: '/stoploss?tab=resumo' },
  { key: 'fila', labelKey: 'stoploss.aba_fila', href: '/stoploss?tab=fila', chave: 'stoploss.aprovar' },
]
// Permissões não vive em NAV (acesso é por isSuperAdmin, não por chave de
// permissão) — item à parte, renderizado com o mesmo `renderNavItems`.
const PERMISSOES_SUB: SubNavItem[] = [
  { key: 'papeis', labelKey: 'permissoes.aba_papeis', href: '/admin/permissoes?tab=papeis' },
  { key: 'usuarios', labelKey: 'permissoes.aba_usuarios', href: '/admin/permissoes?tab=usuarios' },
]

// Sub-item ativo: mesma rota (path) e, se o link usa ?tab= (Lançamento/
// Financeiro/Segurança — várias abas, uma rota só), a mesma aba. Sem aba na
// URL ainda (acabou de entrar na tela) conta a primeira do submenu, que é o
// tab inicial de cada View (useState('lancar') em todas as três). Cadastros
// não usa ?tab=, cada item já é uma rota própria — o path sozinho decide.
function subItemAtivo(sub: SubNavItem, path: string, tabAtivo: string | null, subVisiveis: SubNavItem[]): boolean {
  const subPath = sub.href.split('?')[0]
  if (path !== subPath) return false
  if (!sub.href.includes('?')) return true
  return sub.key === (tabAtivo ?? subVisiveis[0]?.key)
}

// useSearchParams só entra aqui, isolado num componente próprio e coberto
// por Suspense — usar direto na Sidebar (que renderiza em toda página, via
// app/layout.tsx) tiraria o app inteiro da renderização estática (mesmo
// motivo já documentado no LANCAMENTO_SUB acima). Só serve pra saber qual
// ?tab= está ativo; sem isso, a Sidebar cai no fallback (path-only, sem
// destacar a aba) até hidratar — quase sempre imperceptível.
function ComTabAtivo({ children }: { children: (tab: string | null) => React.ReactNode }) {
  const tab = useSearchParams().get('tab')
  return <>{children(tab)}</>
}

const NAV = [
  { href: '/admin/cadastro/superligas', labelKey: 'nav.cadastros', icon: BookOpen, chaves: CADASTRO_CHAVES, subItems: CADASTRO_SUB },
  { href: '/importacao', labelKey: 'nav.importacao', icon: Upload, chaves: ['importacao'] },
  { href: '/lancamento', labelKey: 'nav.lancamento', icon: Wallet, chaves: ['lancamento', 'vip', 'vip.limites', 'relatorios.acertos_pendentes'], subItems: LANCAMENTO_SUB },
  { href: '/financeiro', labelKey: 'nav.financeiro', icon: Landmark, chaves: ['lancamento.genia'], subItems: FINANCEIRO_SUB },
  { href: '/seguranca', labelKey: 'nav.seguranca', icon: ShieldAlert, chaves: ['seguranca'], subItems: SEGURANCA_SUB },
  { href: '/stoploss', labelKey: 'nav.stoploss', icon: Gauge, chaves: ['stoploss'], subItems: STOPLOSS_SUB },
  { href: '/dividas', labelKey: 'nav.dividas', icon: Banknote, chaves: ['dividas'] },
  { href: '/acertos', labelKey: 'nav.acertos', icon: Receipt, chaves: ['acertos.ver'] },
  { href: '/relatorios', labelKey: 'nav.relatorios', icon: FileText, chaves: ['relatorios', 'relatorios.lancamentos', 'relatorios.taxas', 'relatorios.resumo_acertos', 'relatorios.acertos_pendentes', 'lancamento', 'seguranca', 'stoploss', 'vip.relatorio', 'lancamento.genia'], subItems: RELATORIOS_SUB },
  { href: '/admin/regras', labelKey: 'nav.regras', icon: ListChecks, chaves: ['regras'] },
]

// Só o item Permissões — acesso é por isSuperAdmin, não por chave de
// permissão comum, então não entra em NAV/nav (renderizado à parte, mas
// pelo mesmo renderNavItems, pra ganhar submenu igual aos outros).
const PERMISSOES_ITEM = [{ href: '/admin/permissoes', labelKey: 'nav.permissoes', icon: ShieldCheck, subItems: PERMISSOES_SUB }]
// Usado só pra saber quais submenus abrir sozinhos conforme a rota atual —
// Permissões entra aqui mesmo não estando em NAV/nav (ver comentário acima).
// Desce recursivamente pra pegar também sub-subitens com subItems próprio
// (ex: VIP dentro de Suporte) — mesma regra de auto-expandir vale pra
// qualquer nível.
function todosExpansiveis(itens: { href: string; subItems?: SubNavItem[] }[]): { href: string; subItems?: SubNavItem[] }[] {
  const resultado: { href: string; subItems?: SubNavItem[] }[] = []
  for (const item of itens) {
    if (item.subItems) {
      resultado.push(item)
      resultado.push(...todosExpansiveis(item.subItems))
    }
  }
  return resultado
}
const TODOS_OS_ITENS = [...NAV, ...PERMISSOES_ITEM]
const TODOS_EXPANSIVEIS = todosExpansiveis(TODOS_OS_ITENS)

function temPermissaoSub(chave: string | string[] | undefined, hasPermission: (c: string) => boolean): boolean {
  if (!chave) return true
  return Array.isArray(chave) ? chave.some(hasPermission) : hasPermission(chave)
}

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const { loading, profile, isSuperAdmin, hasPermission } = usePermissions()
  const { locale, setLocale, t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  // Menu vira gaveta (drawer) sobreposta no celular — fechada por padrão,
  // e fecha sozinha assim que o usuário navega pra outra tela.
  const [mobileOpen, setMobileOpen] = useState(false)
  // Submenu abre sozinho quando a seção correspondente está ativa; depois
  // disso fica na mão do usuário (clicar na seta abre/fecha) — não fecha
  // sozinho ao navegar pra outro item, só acumula o que já foi aberto.
  const [expandedSubmenus, setExpandedSubmenus] = useState<Set<string>>(() => new Set(TODOS_EXPANSIVEIS.filter((i) => path.startsWith(i.href.split('?')[0])).map((i) => i.href)))

  useEffect(() => {
    if (localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsed(true)
  }, [])

  useEffect(() => {
    const ativos = TODOS_EXPANSIVEIS.filter((i) => path.startsWith(i.href.split('?')[0]))
    if (ativos.length === 0) return
    setExpandedSubmenus((prev) => {
      const faltando = ativos.filter((a) => !prev.has(a.href))
      if (faltando.length === 0) return prev
      const next = new Set(prev)
      for (const a of faltando) next.add(a.href)
      return next
    })
  }, [path])

  function toggleSubmenu(href: string) {
    setExpandedSubmenus((prev) => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Login de clube: experiência isolada, só o próprio extrato — nada de
  // cadastros, importação ou telas internas da liga, não importa a permissão.
  const ehClube = !loading && !!profile?.clube_id
  // Login de agente: mesma ideia, só o próprio rakeback consolidado.
  const ehAgente = !loading && !!profile?.agente_id
  // Login de Liga/SuperLiga/MegaLiga: mesma experiência isolada dos de
  // cima, mas sem Extrato próprio (isso é sempre por clube) — só o menu
  // Acertos, com a hierarquia inteira abaixo da entidade.
  const ehLiga = !loading && !!profile?.liga_id
  const ehSuperLiga = !loading && !!profile?.super_league_id
  const ehMegaLiga = !loading && !!profile?.mega_liga_id
  const ehEntidadeRestrita = ehClube || ehAgente || ehLiga || ehSuperLiga || ehMegaLiga

  const nav = NAV.filter(item => loading || item.chaves.some(c => hasPermission(c)))

  function renderNavItems(tabAtivo: string | null, items: { href: string; labelKey: string; icon: typeof BookOpen; subItems?: SubNavItem[] }[] = nav) {
    return items.map(({ href, labelKey, icon: Icon, subItems }) => {
      const active = path.startsWith(href)
      const expanded = expandedSubmenus.has(href)
      const subVisiveis = subItems?.filter((sub) => loading || temPermissaoSub(sub.chave, hasPermission)) ?? []
      return (
        <div key={href}>
          <div
            className={`flex items-center rounded-lg text-sm font-medium transition-all ${
              active ? 'bg-gold/10 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Link href={href} onClick={() => setMobileOpen(false)} className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{t(labelKey)}</span>
            </Link>
            {subVisiveis.length > 0 && (
              <button
                type="button"
                onClick={() => toggleSubmenu(href)}
                aria-label={expanded ? t('nav.esconder_submenu') : t('nav.mostrar_submenu')}
                className="pl-1 pr-3 py-2.5 shrink-0"
              >
                <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          {subVisiveis.length > 0 && expanded && (
            <div className="ml-4 mt-0.5 mb-1 space-y-0.5 border-l border-white/10 pl-3">
              {subVisiveis.map((sub) => {
                const subSubVisiveis = sub.subItems?.filter((ss) => loading || temPermissaoSub(ss.chave, hasPermission)) ?? []
                const subExpanded = expandedSubmenus.has(sub.href)
                return (
                  <div key={sub.key}>
                    <div
                      className={`flex items-center rounded-md text-xs font-medium transition-all ${
                        subItemAtivo(sub, path, tabAtivo, subVisiveis) ? 'bg-gold/10 text-gold' : 'text-gray-500 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <Link href={sub.href} onClick={() => setMobileOpen(false)} className="flex-1 px-3 py-1.5 min-w-0 truncate">
                        {t(sub.labelKey)}
                      </Link>
                      {subSubVisiveis.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleSubmenu(sub.href)}
                          aria-label={subExpanded ? t('nav.esconder_submenu') : t('nav.mostrar_submenu')}
                          className="pl-1 pr-2 py-1.5 shrink-0"
                        >
                          <ChevronDown size={12} className={`transition-transform ${subExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                    {subSubVisiveis.length > 0 && subExpanded && (
                      <div className="ml-3 mt-0.5 mb-1 space-y-0.5 border-l border-white/10 pl-3">
                        {subSubVisiveis.map((ss) => (
                          <Link
                            key={ss.key}
                            href={ss.href}
                            onClick={() => setMobileOpen(false)}
                            className={`block px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                              subItemAtivo(ss, path, tabAtivo, subSubVisiveis) ? 'bg-gold/10 text-gold' : 'text-gray-600 hover:text-white hover:bg-white/[0.06]'
                            }`}
                          >
                            {t(ss.labelKey)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    })
  }

  const navBody = (
    <>
      <div className="px-4 pt-3">
        <div className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-white/10 text-xs font-semibold text-gray-400">
          <button type="button" onClick={() => setLocale('pt')} title="Português" className={`px-1 hover:text-white transition-colors ${locale === 'pt' ? 'text-gold' : ''}`}>PT</button>
          <span className="text-gray-600">/</span>
          <button type="button" onClick={() => setLocale('en')} title="English" className={`px-1 hover:text-white transition-colors ${locale === 'en' ? 'text-gold' : ''}`}>EN</button>
          <span className="text-gray-600">/</span>
          <button type="button" onClick={() => setLocale('es')} title="Español" className={`px-1 hover:text-white transition-colors ${locale === 'es' ? 'text-gold' : ''}`}>ES</button>
        </div>
      </div>

      {/* Nav — overflow-y-auto + min-h-0 pra rolar quando vários submenus
          abertos ao mesmo tempo passam da altura disponível, sem empurrar
          o rodapé (usuário/logout) pra fora da tela. */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
        {ehEntidadeRestrita ? (
          <>
            {ehClube && (
              <Link
                href="/extrato"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  path.startsWith('/extrato') ? 'bg-gold/10 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Receipt size={16} />
                {t('nav.extrato')}
              </Link>
            )}
            {ehAgente && (
              <Link
                href="/agente/extrato"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  path.startsWith('/agente') ? 'bg-gold/10 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <HandCoins size={16} />
                {t('nav.meusGanhos')}
              </Link>
            )}
            {!ehAgente && (
              <Link
                href="/acertos"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  path.startsWith('/acertos') ? 'bg-gold/10 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <FileText size={16} />
                {t('nav.acertos')}
              </Link>
            )}
          </>
        ) : (
          <>
            <Suspense fallback={<>{renderNavItems(null)}{isSuperAdmin && renderNavItems(null, PERMISSOES_ITEM)}</>}>
              <ComTabAtivo>{(tabAtivo) => <>{renderNavItems(tabAtivo)}{isSuperAdmin && renderNavItems(tabAtivo, PERMISSOES_ITEM)}</>}</ComTabAtivo>
            </Suspense>
          </>
        )}
      </nav>

      {/* Usuário logado + Logout */}
      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        {!loading && profile && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gold/15 text-gold text-xs font-semibold flex items-center justify-center shrink-0">
              {(profile.nome || profile.email || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-white truncate">{profile.nome || profile.email}</p>
              {profile.nome && profile.email && <p className="text-[10px] text-gray-500 truncate">{profile.email}</p>}
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all w-full"
        >
          <LogOut size={16} />
          {t('nav.sair')}
        </button>
      </div>
    </>
  )

  const logo = (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 border border-gold/60 rounded-lg flex items-center justify-center text-gold text-lg shrink-0">◆</div>
      <div className="min-w-0">
        <div className="text-gold font-bold text-base tracking-wide font-display truncate">PokerOS</div>
        <div className="text-white/30 text-xs tracking-widest uppercase" style={{fontSize: '9px'}}>League Platform</div>
      </div>
    </div>
  )

  return (
    <>
      {/* Botão hambúrguer — só no celular, sempre visível (a gaveta some por padrão) */}
      <button
        onClick={() => setMobileOpen(true)}
        title={t('nav.mostrar_menu')}
        className="md:hidden fixed top-4 left-4 z-40 w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-surface2 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
      >
        <Menu size={16} />
      </button>

      {/* Gaveta do celular — sobrepõe o conteúdo, com fundo escurecido atrás */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full border-r border-white/10 bg-surface2 flex flex-col">
            <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between gap-2">
              {logo}
              <button
                onClick={() => setMobileOpen(false)}
                title={t('nav.esconder_menu')}
                className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {navBody}
          </aside>
        </div>
      )}

      {/* Sidebar de mesa — igual antes, com botão de recolher; escondida no celular */}
      <div className="hidden md:block">
        {collapsed ? (
          <button
            onClick={toggleCollapsed}
            title={t('nav.mostrar_menu')}
            className="fixed top-4 left-4 z-40 w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-surface2 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
          >
            <PanelLeftOpen size={16} />
          </button>
        ) : (
          <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-white/10 bg-surface2 flex flex-col">
            <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between gap-2">
              {logo}
              <button
                onClick={toggleCollapsed}
                title={t('nav.esconder_menu')}
                className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            {navBody}
          </aside>
        )}
      </div>
    </>
  )
}

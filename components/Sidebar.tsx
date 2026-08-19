'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Upload, FileText, LogOut, ShieldCheck, ShieldAlert, Wallet, Receipt, PanelLeftClose, PanelLeftOpen, HandCoins, ListChecks, Landmark, Gauge, Crown, Banknote, Menu, X, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

const CADASTRO_CHAVES = ['cadastro.mega_ligas', 'cadastro.superligas', 'cadastro.ligas', 'cadastro.clubes', 'cadastro.super_agentes', 'cadastro.agentes', 'cadastro.jogadores']
const COLLAPSED_KEY = 'pokeros_sidebar_collapsed'

interface SubNavItem { key: string; labelKey: string; href: string; chave?: string }

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
const LANCAMENTO_SUB: SubNavItem[] = [
  { key: 'lancar', labelKey: 'lancamento.aba_lancar', href: '/lancamento?tab=lancar' },
  { key: 'extrato', labelKey: 'lancamento.aba_extrato', href: '/lancamento?tab=extrato' },
  { key: 'pendencias', labelKey: 'lancamento.aba_pendencias', href: '/lancamento?tab=pendencias' },
  { key: 'pagamentos', labelKey: 'lancamento.aba_pagamentos', href: '/lancamento?tab=pagamentos' },
  { key: 'extra', labelKey: 'lancamento.aba_extra', href: '/lancamento?tab=extra' },
  { key: 'conferencia', labelKey: 'lancamento.aba_conferencia', href: '/lancamento?tab=conferencia' },
]
const FINANCEIRO_SUB: SubNavItem[] = [
  { key: 'lancar', labelKey: 'lancamento.aba_lancar', href: '/financeiro?tab=lancar' },
  { key: 'pendencias', labelKey: 'lancamento.aba_pendencias', href: '/financeiro?tab=pendencias' },
  { key: 'conciliacao', labelKey: 'lancamento.aba_conciliacao', href: '/financeiro?tab=conciliacao', chave: 'conciliacao' },
  { key: 'cobranca', labelKey: 'lancamento.aba_cobranca', href: '/financeiro?tab=cobranca' },
]
const SEGURANCA_SUB: SubNavItem[] = [
  { key: 'lancar', labelKey: 'lancamento.aba_lancar', href: '/seguranca?tab=lancar' },
  { key: 'extrato', labelKey: 'lancamento.aba_extrato', href: '/seguranca?tab=extrato' },
]

const NAV = [
  { href: '/admin/cadastro/superligas', labelKey: 'nav.cadastros', icon: BookOpen, chaves: CADASTRO_CHAVES, subItems: CADASTRO_SUB },
  { href: '/importacao', labelKey: 'nav.importacao', icon: Upload, chaves: ['importacao'] },
  { href: '/lancamento', labelKey: 'nav.lancamento', icon: Wallet, chaves: ['lancamento'], subItems: LANCAMENTO_SUB },
  { href: '/financeiro', labelKey: 'nav.financeiro', icon: Landmark, chaves: ['lancamento.genia'], subItems: FINANCEIRO_SUB },
  { href: '/seguranca', labelKey: 'nav.seguranca', icon: ShieldAlert, chaves: ['seguranca'], subItems: SEGURANCA_SUB },
  { href: '/stoploss', labelKey: 'nav.stoploss', icon: Gauge, chaves: ['stoploss'] },
  { href: '/vip', labelKey: 'nav.vip', icon: Crown, chaves: ['vip', 'vip.relatorio', 'vip.limites'] },
  { href: '/dividas', labelKey: 'nav.dividas', icon: Banknote, chaves: ['dividas'] },
  { href: '/relatorios', labelKey: 'nav.relatorios', icon: FileText, chaves: ['relatorios', 'relatorios.acertos', 'relatorios.lancamentos', 'relatorios.taxas'] },
  { href: '/admin/regras', labelKey: 'nav.regras', icon: ListChecks, chaves: ['regras'] },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const { loading, profile, isSuperAdmin, hasPermission } = usePermissions()
  const { locale, toggleLocale, t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  // Menu vira gaveta (drawer) sobreposta no celular — fechada por padrão,
  // e fecha sozinha assim que o usuário navega pra outra tela.
  const [mobileOpen, setMobileOpen] = useState(false)
  // Submenu abre sozinho quando a seção correspondente está ativa; depois
  // disso fica na mão do usuário (clicar na seta abre/fecha) — não fecha
  // sozinho ao navegar pra outro item, só acumula o que já foi aberto.
  const [expandedSubmenus, setExpandedSubmenus] = useState<Set<string>>(() => new Set(NAV.filter((i) => i.subItems && path.startsWith(i.href)).map((i) => i.href)))

  useEffect(() => {
    if (localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsed(true)
  }, [])

  useEffect(() => {
    const ativo = NAV.find((i) => i.subItems && path.startsWith(i.href))
    if (ativo) setExpandedSubmenus((prev) => (prev.has(ativo.href) ? prev : new Set(prev).add(ativo.href)))
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

  const nav = NAV.filter(item => loading || item.chaves.some(c => hasPermission(c)))

  const navBody = (
    <>
      <div className="px-4 pt-3">
        <button
          onClick={toggleLocale}
          title={locale === 'pt' ? 'Switch to English' : 'Mudar para Português'}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-white/10 text-xs font-semibold text-gray-400 hover:text-white hover:border-white/20 transition-colors"
        >
          <span className={locale === 'pt' ? 'text-gold' : ''}>PT</span>
          <span className="text-gray-600">/</span>
          <span className={locale === 'en' ? 'text-gold' : ''}>EN</span>
        </button>
      </div>

      {/* Nav — overflow-y-auto + min-h-0 pra rolar quando vários submenus
          abertos ao mesmo tempo passam da altura disponível, sem empurrar
          o rodapé (usuário/logout) pra fora da tela. */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
        {ehClube ? (
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
        ) : ehAgente ? (
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
        ) : (
          <>
            {nav.map(({ href, labelKey, icon: Icon, subItems }) => {
              const active = path.startsWith(href)
              const expanded = expandedSubmenus.has(href)
              const subVisiveis = subItems?.filter((sub) => !sub.chave || loading || hasPermission(sub.chave)) ?? []
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
                      {subVisiveis.map((sub) => (
                        <Link
                          key={sub.key}
                          href={sub.href}
                          onClick={() => setMobileOpen(false)}
                          className="block px-3 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all"
                        >
                          {t(sub.labelKey)}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {isSuperAdmin && (
              <Link
                href="/admin/permissoes"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  path.startsWith('/admin/permissoes') ? 'bg-gold/10 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <ShieldCheck size={16} />
                {t('nav.permissoes')}
              </Link>
            )}
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

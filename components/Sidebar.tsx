'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Upload, FileText, LogOut, ShieldCheck, Wallet, Receipt, PanelLeftClose, PanelLeftOpen, HandCoins } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

const CADASTRO_CHAVES = ['cadastro.mega_ligas', 'cadastro.superligas', 'cadastro.ligas', 'cadastro.clubes', 'cadastro.super_agentes', 'cadastro.agentes', 'cadastro.jogadores']
const COLLAPSED_KEY = 'pokeros_sidebar_collapsed'

const NAV = [
  { href: '/admin/cadastro/superligas', labelKey: 'nav.cadastros', icon: BookOpen, chaves: CADASTRO_CHAVES },
  { href: '/importacao', labelKey: 'nav.importacao', icon: Upload, chaves: ['importacao'] },
  { href: '/lancamento', labelKey: 'nav.lancamento', icon: Wallet, chaves: ['lancamento'] },
  { href: '/relatorios', labelKey: 'nav.relatorios', icon: FileText, chaves: ['relatorios'] },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const { loading, profile, isSuperAdmin, hasPermission } = usePermissions()
  const { locale, toggleLocale, t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsed(true)
  }, [])

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

  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        title={t('nav.mostrar_menu')}
        className="fixed top-4 left-4 z-40 w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-surface2 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
      >
        <PanelLeftOpen size={16} />
      </button>
    )
  }

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-white/10 bg-surface2 flex flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 border border-gold/60 rounded-lg flex items-center justify-center text-gold text-lg shrink-0">◆</div>
          <div className="min-w-0">
            <div className="text-gold font-bold text-base tracking-wide font-display truncate">PokerOS</div>
            <div className="text-white/30 text-xs tracking-widest uppercase" style={{fontSize: '9px'}}>League Platform</div>
          </div>
        </div>
        <button
          onClick={toggleCollapsed}
          title={t('nav.esconder_menu')}
          className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

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

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {ehClube ? (
          <Link
            href="/extrato"
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
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              path.startsWith('/agente') ? 'bg-gold/10 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <HandCoins size={16} />
            {t('nav.meusGanhos')}
          </Link>
        ) : (
          <>
            {nav.map(({ href, labelKey, icon: Icon }) => {
              const active = path.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active ? 'bg-gold/10 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon size={16} />
                  {t(labelKey)}
                </Link>
              )
            })}
            {isSuperAdmin && (
              <Link
                href="/admin/permissoes"
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
    </aside>
  )
}

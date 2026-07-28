'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Trophy, Shield, Users, Bot, Zap, User, Crown, Lock } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

const NAV = [
  { href: '/admin/cadastro/mega-ligas', labelKey: 'cadastro_menu.mega_ligas', descKey: 'cadastro_menu.mega_ligas_desc', icon: Zap, chave: 'cadastro.mega_ligas' },
  { href: '/admin/cadastro/superligas', labelKey: 'cadastro_menu.superligas', descKey: 'cadastro_menu.superligas_desc', icon: Trophy, chave: 'cadastro.superligas' },
  { href: '/admin/cadastro/ligas', labelKey: 'cadastro_menu.ligas', descKey: 'cadastro_menu.ligas_desc', icon: Shield, chave: 'cadastro.ligas' },
  { href: '/admin/cadastro/clubes', labelKey: 'cadastro_menu.clubes', descKey: 'cadastro_menu.clubes_desc', icon: Users, chave: 'cadastro.clubes' },
  { href: '/admin/cadastro/super-agentes', labelKey: 'cadastro_menu.super_agentes', descKey: 'cadastro_menu.super_agentes_desc', icon: Crown, chave: 'cadastro.super_agentes' },
  { href: '/admin/cadastro/agentes', labelKey: 'cadastro_menu.agentes', descKey: 'cadastro_menu.agentes_desc', icon: Bot, chave: 'cadastro.agentes' },
  { href: '/admin/cadastro/jogadores', labelKey: 'cadastro_menu.jogadores', descKey: 'cadastro_menu.jogadores_desc', icon: User, chave: 'cadastro.jogadores' },
]

export default function CadastroLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { loading, hasPermission } = usePermissions()
  const { t } = useI18n()
  const nav = NAV.filter(item => loading || hasPermission(item.chave))
  const atual = NAV.find(item => path.startsWith(item.href))
  const permitido = loading || !atual || hasPermission(atual.chave)

  return (
    <div className="flex gap-8 min-h-full">
      <aside className="w-56 shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">{t('cadastro_menu.titulo')}</p>
        <nav className="space-y-1">
          {nav.map(({ href, labelKey, descKey, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all group">
              <Icon size={16} className="shrink-0" />
              <div><div className="text-sm font-medium leading-tight">{t(labelKey)}</div><div className="text-xs text-gray-600 group-hover:text-gray-500 transition-colors">{t(descKey)}</div></div>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        {permitido ? children : (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Lock size={28} className="text-gray-600" />
            <p className="text-white font-medium">{t('cadastro_menu.sem_permissao_titulo')}</p>
            <p className="text-sm text-gray-500">{t('cadastro_menu.sem_permissao_desc')}</p>
          </div>
        )}
      </main>
    </div>
  )
}

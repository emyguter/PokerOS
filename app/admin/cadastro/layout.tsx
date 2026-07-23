'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Trophy, Shield, Users, Bot, Zap, User, Crown, Lock } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'

const NAV = [
  { href: '/admin/cadastro/mega-ligas', label: 'Mega Ligas', icon: Zap, desc: 'Agrupa superligas', chave: 'cadastro.mega_ligas' },
  { href: '/admin/cadastro/superligas', label: 'Superligas', icon: Trophy, desc: 'Grupos de ligas', chave: 'cadastro.superligas' },
  { href: '/admin/cadastro/ligas', label: 'Ligas', icon: Shield, desc: 'Clientes da plataforma', chave: 'cadastro.ligas' },
  { href: '/admin/cadastro/clubes', label: 'Clubes', icon: Users, desc: 'Com regras financeiras', chave: 'cadastro.clubes' },
  { href: '/admin/cadastro/super-agentes', label: 'Super Agentes', icon: Crown, desc: 'Agentes de agentes', chave: 'cadastro.super_agentes' },
  { href: '/admin/cadastro/agentes', label: 'Agentes', icon: Bot, desc: 'Responsáveis por jogadores', chave: 'cadastro.agentes' },
  { href: '/admin/cadastro/jogadores', label: 'Jogadores', icon: User, desc: 'Vinculados a agente ou clube', chave: 'cadastro.jogadores' },
]

export default function CadastroLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { loading, hasPermission } = usePermissions()
  const nav = NAV.filter(item => loading || hasPermission(item.chave))
  const atual = NAV.find(item => path.startsWith(item.href))
  const permitido = loading || !atual || hasPermission(atual.chave)

  return (
    <div className="flex gap-8 min-h-full">
      <aside className="w-56 shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Cadastros</p>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon, desc }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all group">
              <Icon size={16} className="shrink-0" />
              <div><div className="text-sm font-medium leading-tight">{label}</div><div className="text-xs text-gray-600 group-hover:text-gray-500 transition-colors">{desc}</div></div>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        {permitido ? children : (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Lock size={28} className="text-gray-600" />
            <p className="text-white font-medium">Você não tem permissão pra ver essa tela</p>
            <p className="text-sm text-gray-500">Peça pra um administrador liberar o acesso em Permissões.</p>
          </div>
        )}
      </main>
    </div>
  )
}

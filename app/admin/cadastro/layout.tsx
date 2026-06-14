import Link from 'next/link'
import { Trophy, Shield, Users, Bot, Zap } from 'lucide-react'

const NAV = [
  { href: '/admin/cadastro/mega-ligas', label: 'Mega Ligas', icon: Zap, desc: 'Agrupa superligas' },
  { href: '/admin/cadastro/superligas', label: 'Superligas', icon: Trophy, desc: 'Grupos de ligas' },
  { href: '/admin/cadastro/ligas', label: 'Ligas', icon: Shield, desc: 'Clientes da plataforma' },
  { href: '/admin/cadastro/clubes', label: 'Clubes', icon: Users, desc: 'Com regras financeiras' },
  { href: '/admin/cadastro/agentes', label: 'Agentes', icon: Bot, desc: 'Responsáveis por jogadores' },
]

export default function CadastroLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-8 min-h-full">
      <aside className="w-56 shrink-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Cadastros</p>
        <nav className="space-y-1">
          {NAV.map(({ href, label, icon: Icon, desc }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all group">
              <Icon size={16} className="shrink-0" />
              <div><div className="text-sm font-medium leading-tight">{label}</div><div className="text-xs text-gray-600 group-hover:text-gray-500 transition-colors">{desc}</div></div>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, Upload, FileText, LogOut, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const CADASTROS = [
  { href: '/admin/cadastro/mega-ligas', label: 'Mega Ligas' },
  { href: '/admin/cadastro/superligas', label: 'Superligas' },
  { href: '/admin/cadastro/ligas', label: 'Ligas' },
  { href: '/admin/cadastro/clubes', label: 'Clubes' },
  { href: '/admin/cadastro/agentes', label: 'Agentes' },
  { href: '/admin/cadastro/jogadores', label: 'Jogadores' },
]

const NAV = [
  { href: '/importacao', label: 'Importação', icon: Upload },
  { href: '/relatorios', label: 'Relatórios', icon: FileText },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const cadastroActive = path.startsWith('/admin/cadastro')
  const [cadastroOpen, setCadastroOpen] = useState(cadastroActive)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-white/10 bg-surface2 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 border border-gold/60 rounded-lg flex items-center justify-center text-gold text-lg">◆</div>
          <div>
            <div className="text-gold font-bold text-base tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>PokerOS</div>
            <div className="text-white/30 text-xs tracking-widest uppercase" style={{ fontSize: '9px' }}>League Platform</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

        {/* Cadastros — expansível */}
        <div>
          <button
            onClick={() => setCadastroOpen(o => !o)}
            className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              cadastroActive ? 'bg-gold/10 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <span className="flex items-center gap-3">
              <BookOpen size={16} />
              Cadastros
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform ${cadastroOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {cadastroOpen && (
            <div className="mt-1 ml-4 pl-3 border-l border-white/10 space-y-0.5">
              {CADASTROS.map(({ href, label }) => {
                const active = path.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center px-3 py-2 rounded-lg text-sm transition-all ${
                      active ? 'text-gold font-medium' : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    {label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Outros itens */}
        {NAV.map(({ href, label, icon: Icon }) => {
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
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all w-full"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}
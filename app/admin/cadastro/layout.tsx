'use client'
import { usePathname } from 'next/navigation'
import { Lock } from 'lucide-react'
import { usePermissions } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

// A navegação entre Mega Ligas/Superligas/Ligas/Clubes/... já vive no
// submenu "Cadastros" da Sidebar — esse layout só cuida do bloqueio por
// permissão, sem repetir o mesmo menu de novo na tela.
const NAV = [
  { href: '/admin/cadastro/mega-ligas', chave: 'cadastro.mega_ligas' },
  { href: '/admin/cadastro/superligas', chave: 'cadastro.superligas' },
  { href: '/admin/cadastro/ligas', chave: 'cadastro.ligas' },
  { href: '/admin/cadastro/clubes', chave: 'cadastro.clubes' },
  { href: '/admin/cadastro/super-agentes', chave: 'cadastro.super_agentes' },
  { href: '/admin/cadastro/agentes', chave: 'cadastro.agentes' },
  { href: '/admin/cadastro/jogadores', chave: 'cadastro.jogadores' },
]

export default function CadastroLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { loading, hasPermission } = usePermissions()
  const { t } = useI18n()
  const atual = NAV.find(item => path.startsWith(item.href))
  const permitido = loading || !atual || hasPermission(atual.chave)

  if (!permitido) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Lock size={28} className="text-gray-600" />
        <p className="text-white font-medium">{t('cadastro_menu.sem_permissao_titulo')}</p>
        <p className="text-sm text-gray-500">{t('cadastro_menu.sem_permissao_desc')}</p>
      </div>
    )
  }

  return <>{children}</>
}

import type { Metadata, Viewport } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import Footer from '@/components/Footer'
import { PermissionsProvider } from '@/lib/permissions'
import { I18nProvider } from '@/lib/i18n'
import './globals.css'

// Fonte única pro app inteiro (antes: Calibri no resto do app — que nem
// vem instalada fora do Windows — e Playfair/DM Sans só na tela de login).
const display = Playfair_Display({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display' })
const sans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'PokerOS',
  description: 'League Platform',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`}>
      <body>
        <I18nProvider>
          <PermissionsProvider>
            <div className="app-shell">
              <Sidebar />
              <div className="flex flex-col flex-1 min-w-0">
                <main className="main-content flex-1">{children}</main>
                <Footer />
              </div>
            </div>
          </PermissionsProvider>
        </I18nProvider>
      </body>
    </html>
  )
}

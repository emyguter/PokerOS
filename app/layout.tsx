import type { Metadata } from 'next'
import Sidebar from '@/components/Sidebar'
import Footer from '@/components/Footer'
import { PermissionsProvider } from '@/lib/permissions'
import './globals.css'

export const metadata: Metadata = {
  title: 'PokerOS',
  description: 'League Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <PermissionsProvider>
          <div className="app-shell">
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <main className="main-content flex-1">{children}</main>
              <Footer />
            </div>
          </div>
        </PermissionsProvider>
      </body>
    </html>
  )
}

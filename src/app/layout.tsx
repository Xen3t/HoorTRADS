import type { Metadata } from 'next'
import { Titillium_Web } from 'next/font/google'
import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import 'flag-icons/css/flag-icons.min.css'
import './globals.css'
import UserBar from '@/components/UserBar'
import { getDb } from '@/lib/db/database'
import { getAppConfig } from '@/lib/db/queries'
import { getSession } from '@/lib/auth'

const titilliumWeb = Titillium_Web({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-titillium',
})

export const metadata: Metadata = {
  title: 'HoorTRADS — Outil de traduction visuelle',
  description: 'Traduction automatique de visuels publicitaires pour le e-commerce européen',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Check maintenance mode
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || '/'

  const isMaintenancePage = pathname.startsWith('/maintenance')
  const isApiRoute = pathname.startsWith('/api/')

  if (!isMaintenancePage && !isApiRoute) {
    try {
      const db = getDb()
      const maintenanceMode = getAppConfig(db, 'maintenance_mode')
      if (maintenanceMode === 'true') {
        // Check if current user is admin — admins bypass maintenance
        const cookieStore = await cookies()
        const token = cookieStore.get('hoortrad_session')?.value
        const user = token ? getSession(token) : null
        if (!user || user.role !== 'admin') {
          redirect('/maintenance')
        }
      }
    } catch {
      // DB not available — don't block the app
    }
  }

  return (
    <html lang="fr" className={`${titilliumWeb.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="flex items-center justify-between px-8 py-3 text-[11px] text-text-disabled border-t border-border/50">
          <span>© 2026 - HOORTRADE</span>
          <UserBar />
        </footer>
      </body>
    </html>
  )
}

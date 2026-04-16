import type { Metadata } from 'next'
import { Titillium_Web } from 'next/font/google'
import 'flag-icons/css/flag-icons.min.css'
import './globals.css'

const titilliumWeb = Titillium_Web({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-titillium',
})

export const metadata: Metadata = {
  title: 'HoorTRADS — Outil de traduction visuelle',
  description: 'Traduction automatique de visuels publicitaires pour le e-commerce européen',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${titilliumWeb.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}

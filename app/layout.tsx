import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import TabBar from '@/components/TabBar'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Summit',
  description: 'Track your summer goals and daily progress',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Summit',
  },
  formatDetection: { telephone: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="bg-zinc-950 text-zinc-50 min-h-screen font-sans antialiased">
        <main className="max-w-lg mx-auto pb-24 min-h-screen">
          {children}
        </main>
        <TabBar />
      </body>
    </html>
  )
}

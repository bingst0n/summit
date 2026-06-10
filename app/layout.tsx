import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import TabBar from '@/components/TabBar'
import SideNav from '@/components/SideNav'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Required for env(safe-area-inset-*) to be non-zero on iOS — without it,
  // pt-safe/pb-safe collapse and content slides under the notch/home indicator
  // in standalone (Add to Home Screen) mode.
  viewportFit: 'cover',
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
        <SideNav />
        {/* Mobile: narrow column + bottom tab bar clearance (pb-24).
            Desktop (md+): clear the fixed w-60 sidebar and widen the content. */}
        <main className="pb-24 min-h-screen md:pl-60 md:pb-10">
          <div className="max-w-lg mx-auto md:max-w-3xl md:px-4">
            {children}
          </div>
        </main>
        <TabBar />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}

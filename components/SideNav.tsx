'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from './navItems'

// Desktop-only sidebar (hidden below md); mobile uses TabBar instead.
export default function SideNav() {
  const pathname = usePathname()

  return (
    <nav className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-line bg-bg px-4 py-8">
      <Link href="/" className="px-3 mb-1 flex items-center gap-2.5">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff7847" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 20l7-14 4 8 2-4 5 10z" />
        </svg>
        <span className="text-xl font-bold tracking-tight">Summit</span>
      </Link>
      <p className="px-3 mb-8 font-mono text-[10px] tracking-[0.18em] text-mut">EXPEDITION LOG</p>

      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-xs tracking-[0.14em] transition-colors ${
                active
                  ? 'bg-panel text-ember'
                  : 'text-mut hover:text-fg hover:bg-panel/60'
              }`}
            >
              {item.icon(active)}
              {item.label}
            </Link>
          )
        })}
      </div>

      <p className="mt-auto px-3 font-mono text-[10px] tracking-[0.14em] text-mut/60">● ON ROUTE</p>
    </nav>
  )
}

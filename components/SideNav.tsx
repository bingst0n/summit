'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from './navItems'

// Desktop-only sidebar (hidden below md); mobile uses TabBar instead.
export default function SideNav() {
  const pathname = usePathname()

  return (
    <nav className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-zinc-800 bg-zinc-950 px-4 py-8">
      <Link href="/" className="px-3 mb-8 flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5">
          <path d="M3 20l7-14 4 8 2-4 5 10z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xl font-bold tracking-tight">Summit</span>
      </Link>

      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-zinc-900 text-indigo-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              {item.icon(active)}
              {item.label}
            </Link>
          )
        })}
      </div>

      <p className="mt-auto px-3 text-xs text-zinc-600">Summer goal tracker</p>
    </nav>
  )
}

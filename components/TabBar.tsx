'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from './navItems'

// Mobile-only bottom tab bar (hidden at md+); desktop uses SideNav instead.
export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800">
      <div className="max-w-lg mx-auto flex pb-safe">
        {NAV_ITEMS.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors ${
                active ? 'text-indigo-400' : 'text-zinc-500'
              }`}
            >
              {tab.icon(active)}
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

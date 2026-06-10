'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from './navItems'

// Mobile-only bottom tab bar (hidden at md+); desktop uses SideNav instead.
export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-bg/95 backdrop-blur border-t border-line">
      <div className="max-w-lg mx-auto flex pb-safe">
        {NAV_ITEMS.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center py-3 gap-1 font-mono text-[10px] tracking-[0.14em] transition-colors ${
                active ? 'text-ember' : 'text-mut/70'
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

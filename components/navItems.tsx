// Shared nav definition — rendered as a bottom tab bar on mobile (TabBar)
// and a left sidebar on desktop (SideNav). Expedition naming: the dashboard
// is base camp, the calendar is the map, the advisor is the radio, and
// check-in history is the logbook.
export const NAV_ITEMS = [
  {
    href: '/',
    label: 'BASE',
    icon: (active: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* tent */}
        <path d="M12 3L2 20h20L12 3z" />
        <path d="M12 13l-3.5 7h7L12 13z" stroke={active ? '#0c1320' : 'currentColor'} strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    href: '/calendar',
    label: 'MAP',
    icon: (active: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill={active ? 'currentColor' : 'none'} />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" stroke={active ? '#0c1320' : 'currentColor'} />
      </svg>
    ),
  },
  {
    href: '/advisor',
    label: 'RADIO',
    icon: (active: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    href: '/history',
    label: 'LOG',
    icon: (active: boolean) => (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" fill={active ? 'currentColor' : 'none'} />
        <polyline points="12,7 12,12 15.5,14" stroke={active ? '#0c1320' : 'currentColor'} />
      </svg>
    ),
  },
]

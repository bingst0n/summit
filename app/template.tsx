'use client'

// A template.tsx remounts on every navigation (unlike layout.tsx), so wrapping
// children here replays the enter animation each time the user switches tabs.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}

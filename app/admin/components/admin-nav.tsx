'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconChecklist, IconFlag, IconAntenna, IconTrash } from '@tabler/icons-react'

const NAV_ITEMS = [
  { href: '/admin/queue', label: 'Moderation Queue', icon: IconChecklist },
  { href: '/admin/reports', label: 'Reports', icon: IconFlag },
  { href: '/admin/channels', label: 'Channels', icon: IconAntenna },
  { href: '/admin/removals', label: 'Removals', icon: IconTrash },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-zinc-100 text-zinc-950'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950'
            }`}
          >
            <Icon size={18} stroke={2} className={isActive ? 'text-zinc-950' : 'text-zinc-500'} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

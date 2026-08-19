import { forbidden } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin, ForbiddenError, UnauthorizedError } from '@/lib/session'
import { AdminNav } from './components/admin-nav'

export const metadata = {
  title: {
    template: '%s · Admin · Gulit',
    default: 'Admin · Gulit',
  },
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof UnauthorizedError) {
      forbidden()
    }
    throw err
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans text-zinc-950">
      {/* Top Header */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-6">
        <Link href="/" className="font-bold tracking-tight text-primary">
          Gulit Admin
        </Link>
        <div className="flex-1" />
        <div className="text-sm text-zinc-600">
          Logged in as <span className="font-medium text-zinc-950">{admin.username || 'Admin'}</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
          <AdminNav />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

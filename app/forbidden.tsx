import Link from 'next/link'

export default function Forbidden() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <Link href="/" className="font-bold text-3xl tracking-tight text-primary">
            Gulit
          </Link>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Access Denied
          </h1>
          <p className="text-zinc-600">
            You do not have permission to view this page. If you believe this is an error, please contact your administrator.
          </p>
        </div>
        <div>
          <Link 
            href="/" 
            className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-8 text-sm font-medium text-zinc-50 shadow transition-colors hover:bg-zinc-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

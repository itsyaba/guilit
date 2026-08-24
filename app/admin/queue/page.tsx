import { requireAdmin } from '@/lib/session'
import { getModerationQueue } from '@/lib/moderation-queue'
import { QueueWorkspace } from './components/queue-workspace'

export const metadata = {
  title: 'Moderation Queue',
}

export default async function QueuePage() {
  await requireAdmin()

  const items = await getModerationQueue()

  return <QueueWorkspace initialItems={items} />
}

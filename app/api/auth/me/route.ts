import { getSessionUser } from "@/lib/session"

export async function GET() {
  const user = await getSessionUser()
  if (!user) return Response.json(null)

  return Response.json({
    id: user.id,
    username: user.username,
    trustLevel: user.trustLevel,
    phoneVerified: user.phoneVerified,
  })
}

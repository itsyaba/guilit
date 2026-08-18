import { cookies } from "next/headers"
import type { NextResponse } from "next/server"
import { jwtVerify, SignJWT } from "jose"
import { eq } from "drizzle-orm"

import { db } from "@/db/client"
import { users } from "@/db/schema"
import type { User } from "@/db/types"

export const SESSION_COOKIE = "gl_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

/**
 * Sessions are a signed JWT in an httpOnly cookie, not a DB-backed session
 * table — no auth-provider dependency, and no server-side state to lose on a
 * container restart as long as SESSION_SECRET stays stable across restarts.
 */
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET environment variable is not set")
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret())
}

async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

/** Sets the session cookie directly on a route handler's response. */
export async function attachSessionCookie(
  response: NextResponse,
  userId: string
): Promise<void> {
  const token = await createSessionToken(userId)
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE)
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function getSessionUser(): Promise<User | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  return user ?? null
}

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

export async function requireSessionUser(): Promise<User> {
  const user = await getSessionUser()
  if (!user) throw new UnauthorizedError()
  return user
}

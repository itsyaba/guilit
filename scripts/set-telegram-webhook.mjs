#!/usr/bin/env node
/**
 * Register (or inspect, or remove) the bot webhook that backs the deep-link
 * login in app/api/auth/telegram/bot/route.ts.
 *
 * The Bot API pushes updates; it does not let us pull them on a serverless
 * host, so nothing about the login works until Telegram has been told where to
 * deliver. This has to be run once per bot per environment — the webhook is a
 * property of the bot, not of a deployment, so pointing it at a preview URL
 * takes production's logins with it.
 *
 *   node scripts/set-telegram-webhook.mjs            # register
 *   node scripts/set-telegram-webhook.mjs --info     # what Telegram thinks now
 *   node scripts/set-telegram-webhook.mjs --delete   # unregister
 *   node scripts/set-telegram-webhook.mjs --url https://tunnel.example  # override
 *
 * Env comes from .env.local then .env, matching drizzle.config.ts. Parsed here
 * rather than with dotenv so the script has no dependencies of its own and
 * still runs in a container that only installed production packages.
 */

import { readFileSync } from "node:fs"

function loadEnvFile(path) {
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // Real environment wins over a file, so CI can override without editing.
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(".env.local")
loadEnvFile(".env")

const args = process.argv.slice(2)
const wants = (flag) => args.includes(flag)
const flagValue = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set. Get it from @BotFather.")
  process.exit(1)
}

async function callBot(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const payload = await response.json()
  if (!payload.ok) {
    console.error(`${method} failed: ${payload.description ?? response.status}`)
    process.exit(1)
  }
  return payload.result
}

const me = await callBot("getMe")
console.log(`Bot: @${me.username} (id ${me.id})`)

if (wants("--info")) {
  const info = await callBot("getWebhookInfo")
  console.log(JSON.stringify(info, null, 2))
  if (!info.url) {
    console.log("\nNo webhook registered — deep-link login will never complete.")
  }
  if (info.last_error_message) {
    console.log(
      `\nTelegram's last delivery failed: ${info.last_error_message}\n` +
        "A 403 here means the secret token does not match TELEGRAM_WEBHOOK_SECRET."
    )
  }
  process.exit(0)
}

if (wants("--delete")) {
  await callBot("deleteWebhook", { drop_pending_updates: true })
  console.log("Webhook removed. Deep-link login is now dead until re-registered.")
  process.exit(0)
}

const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
if (!secret) {
  console.error(
    "TELEGRAM_WEBHOOK_SECRET is not set.\n" +
      "Generate one, put it in your env, and set the same value on the deployment:\n" +
      "  openssl rand -hex 32"
  )
  process.exit(1)
}
// Telegram's own constraint on the header value.
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error(
    "TELEGRAM_WEBHOOK_SECRET must be 1-256 chars of A-Z a-z 0-9 _ - only."
  )
  process.exit(1)
}

const base = (flagValue("--url") ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim()
if (!base) {
  console.error("Pass --url or set NEXT_PUBLIC_APP_URL to the public app URL.")
  process.exit(1)
}
if (!base.startsWith("https://")) {
  console.error(
    `Telegram only delivers to https. Got: ${base}\n` +
      "For local work, expose the dev server first:\n" +
      "  cloudflared tunnel --url http://localhost:3000"
  )
  process.exit(1)
}

const url = `${base.replace(/\/+$/, "")}/api/auth/telegram/bot`

await callBot("setWebhook", {
  url,
  secret_token: secret,
  // Only `message` is read by the handler. Narrowing it here means Telegram
  // never spends a delivery on an edit or a reaction we would drop anyway.
  allowed_updates: ["message"],
  // Anything queued from before this URL existed is noise, and a stale /start
  // carries a nonce that has long since expired.
  drop_pending_updates: true,
})

console.log(`Webhook set: ${url}`)
console.log("Verify with: node scripts/set-telegram-webhook.mjs --info")

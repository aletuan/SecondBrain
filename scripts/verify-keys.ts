/**
 * Smoke-check API keys from `.env` (no secrets printed).
 * Run: cd reader && pnpm verify-keys
 */
import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import OpenAI from 'openai';

async function checkOpenAI(): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return 'OpenAI: SKIP (OPENAI_API_KEY unset)';
  try {
    const client = new OpenAI({ apiKey: key });
    await client.models.list();
    return 'OpenAI: OK (models.list)';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `OpenAI: FAIL — ${msg}`;
  }
}

async function checkApify(): Promise<string> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) return 'Apify: SKIP (APIFY_TOKEN unset)';
  try {
    const client = new ApifyClient({ token });
    const me = await client.user().get();
    const id = me?.username ?? me?.id ?? 'ok';
    return `Apify: OK (user: ${String(id)})`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Apify: FAIL — ${msg}`;
  }
}

async function checkX(): Promise<string> {
  const bearer = process.env.X_BEARER_TOKEN?.trim();
  if (!bearer) return 'X API: SKIP (X_BEARER_TOKEN unset)';
  try {
    // `/2/users/me` requires OAuth **user** context; Bearer trong `.env` thường là
    // **Application-Only** → 403 "Unsupported Authentication". User lookup công khai
    // chấp nhận app-only (đủ để kiểm tra token).
    const url =
      'https://api.twitter.com/2/users/by/username/X?user.fields=username';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return `X API: HTTP ${res.status} — ${body.slice(0, 160)}`;
    }
    const data = (await res.json()) as { data?: { username?: string } };
    const u = data?.data?.username ?? 'ok';
    return `X API: OK (app-only; looked up @${u})`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `X API: FAIL — ${msg}`;
  }
}

async function main(): Promise<void> {
  const lines = await Promise.all([checkOpenAI(), checkApify(), checkX()]);
  for (const line of lines) console.log(line);
  const failed = lines.some(
    (l) => l.includes('FAIL') || /: HTTP [45]\d\d/.test(l),
  );
  if (failed) process.exitCode = 1;
}

main();

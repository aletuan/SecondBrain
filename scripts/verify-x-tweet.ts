/**
 * Kiểm tra Bearer (app-only) có đọc được tweet theo ID không.
 * Usage: pnpm verify-x-tweet [tweetId]
 * Example: pnpm verify-x-tweet 2034902650534187503
 */
import 'dotenv/config';

const defaultId = '2034902650534187503';

async function main(): Promise<void> {
  const tweetId = (process.argv[2] ?? defaultId).replace(/\D/g, '');
  if (!tweetId) {
    console.error('Usage: pnpm verify-x-tweet [tweetId]');
    process.exitCode = 1;
    return;
  }

  const token = process.env.X_BEARER_TOKEN?.trim();
  if (!token) {
    console.error('Thiếu X_BEARER_TOKEN trong .env');
    process.exitCode = 1;
    return;
  }

  const params = new URLSearchParams({
    'tweet.fields': 'created_at,author_id,public_metrics,text,entities,note_tweet,article',
    expansions: 'author_id',
    'user.fields': 'username,name',
  });
  const url = `https://api.twitter.com/2/tweets/${tweetId}?${params}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await res.text();
  console.log(`GET /2/tweets/${tweetId}`);
  console.log(`HTTP ${res.status}`);
  try {
    const json = JSON.parse(body) as {
      data?: { text?: string; id?: string; author_id?: string };
      includes?: { users?: Array<{ username?: string; name?: string }> };
      errors?: unknown[];
    };
    console.log(JSON.stringify(json, null, 2));
    if (res.ok && json.data?.text) {
      console.log('\n--- text (preview) ---\n');
      console.log(json.data.text.slice(0, 500) + (json.data.text.length > 500 ? '…' : ''));
    }
  } catch {
    console.log(body.slice(0, 1500));
  }

  if (!res.ok) process.exitCode = 1;
}

main();

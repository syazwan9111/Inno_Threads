// Terbitkan post yang sudah sampai waktunya dari queue/posts.json ke Threads.
// Tiada dependency: Node 20+ sahaja.
//
// Env:
//   THREADS_ACCESS_TOKEN  token long-lived Threads (wajib kecuali DRY_RUN=1)
//   THREADS_USER_ID       ID pengguna Threads (jika tiada, skrip cuba /me)
//   DRY_RUN=1             jangan panggil API; hanya tunjuk apa yang akan diterbitkan
//   QUEUE_FILE            laluan fail giliran (lalai: queue/posts.json)

import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://graph.threads.net/v1.0';
const QUEUE_FILE = process.env.QUEUE_FILE || 'queue/posts.json';
const DRY_RUN = process.env.DRY_RUN === '1';
const TOKEN = process.env.THREADS_ACCESS_TOKEN || '';
const MAX_LATE_MS = 6 * 60 * 60 * 1000; // post yang lewat lebih 6 jam tidak diterbitkan
const MAX_CHARS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, params = {}) {
  const url = new URL(path.startsWith('http') ? path : API + path);
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const opts = { method };
  if (method === 'GET') url.search = body.toString();
  else opts.body = body;
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function resolveUserId() {
  if (process.env.THREADS_USER_ID) return process.env.THREADS_USER_ID;
  const me = await call('GET', '/me', { fields: 'id' });
  return me.id;
}

async function publishOne(userId, post) {
  const container = await call('POST', `/${userId}/threads`, {
    media_type: 'TEXT',
    text: post.text,
  });

  // Tunggu container siap (Meta cadang purata 30 saat; teks biasanya lebih cepat).
  let ready = false;
  for (let i = 0; i < 10 && !ready; i++) {
    await sleep(i === 0 ? 5000 : 6000);
    try {
      const st = await call('GET', `/${container.id}`, { fields: 'status,error_message' });
      if (st.status === 'ERROR' || st.status === 'EXPIRED') {
        throw new Error(st.error_message || `Container ${st.status}`);
      }
      ready = st.status === 'FINISHED';
    } catch (e) {
      if (/Container|ERROR|EXPIRED/.test(e.message)) throw e;
    }
  }

  const published = await call('POST', `/${userId}/threads_publish`, {
    creation_id: container.id,
  });

  let permalink = null;
  try {
    const info = await call('GET', `/${published.id}`, { fields: 'id,permalink' });
    permalink = info.permalink || null;
  } catch {
    // Pautan tidak wajib; post sudah terbit.
  }
  return { threads_id: published.id, permalink };
}

async function main() {
  const queue = JSON.parse(await readFile(QUEUE_FILE, 'utf8'));
  const now = Date.now();
  const due = queue.posts
    .filter((p) => p.status === 'scheduled' && Date.parse(p.publish_at) <= now)
    .sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));

  if (due.length === 0) {
    console.log('Tiada post yang sampai waktunya.');
    return;
  }
  if (!DRY_RUN && !TOKEN) {
    throw new Error('THREADS_ACCESS_TOKEN belum ditetapkan dalam Secrets repo.');
  }

  const userId = DRY_RUN ? 'dry-run' : await resolveUserId();
  let failures = 0;

  for (const post of due) {
    const late = now - Date.parse(post.publish_at);
    const label = `${post.id} (${post.publish_at})`;

    if (late > MAX_LATE_MS) {
      post.status = 'failed';
      post.error = 'Terlepas waktu lebih 6 jam, tidak diterbitkan.';
      console.log(`LANGKAU ${label}: terlalu lewat`);
      failures++;
    } else if ([...post.text].length > MAX_CHARS) {
      post.status = 'failed';
      post.error = `Teks melebihi ${MAX_CHARS} aksara.`;
      console.log(`GAGAL ${label}: terlalu panjang`);
      failures++;
    } else if (DRY_RUN) {
      console.log(`DRY RUN, akan terbit ${label}:\n${post.text}\n`);
      continue;
    } else {
      try {
        const result = await publishOne(userId, post);
        post.status = 'published';
        post.published_at = new Date().toISOString();
        post.threads_id = result.threads_id;
        post.permalink = result.permalink;
        delete post.error;
        console.log(`TERBIT ${label} -> ${result.permalink || result.threads_id}`);
      } catch (e) {
        post.status = 'failed';
        post.error = String(e.message || e).slice(0, 300);
        console.log(`GAGAL ${label}: ${post.error}`);
        failures++;
      }
    }
    // Simpan selepas setiap post supaya post yang sudah terbit tidak diulang.
    queue.updated_at = new Date().toISOString();
    await writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2) + '\n');
  }

  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

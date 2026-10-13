import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../src/store.ts';
import { Chat } from '../src/chat.ts';
import { validateImage } from '../src/attachments.ts';
import { MediaLinks, byteRange } from '../src/media-links.ts';

const mp4 = await readFile(new URL('fixtures/bear.mp4', import.meta.url));
const webm = await readFile(new URL('fixtures/bear.webm', import.meta.url));
const picture = await readFile(new URL('../sample-assets/leaking-sink.png', import.meta.url));
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
}
async function start(db, port) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), CHAT_DB: db }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; child.stderr.on('data', (data) => { log += data; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup failed: ' + log)), 5000);
    child.stdout.on('data', (data) => { if (String(data).includes('Nearby Chat')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Server exited: ' + log)); });
  }); return child;
}
async function stop(child) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
async function files(directory) { try { return await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
const form = (bytes = mp4, text = 'Video of the leaking sink', id = randomUUID(), mime = 'video/mp4') => {
  const body = new FormData(); body.append('text', text); body.append('clientMessageId', id);
  body.append('durationSeconds', '2.75'); body.append('media', new Blob([bytes], { type: mime }), mime === 'video/webm' ? 'leak.webm' : 'leak.mp4'); return body;
};

test('video storage metadata, signed streaming/seek, fault retries, legacy images and restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nearby-video-')), db = join(directory, 'chat.sqlite'), port = await freePort();
  const oldStore = new Store(db);
  const old = new Chat(oldStore).send('customer', 'support-thread', { text: 'legacy image', clientMessageId: 'before-upgrade' }, validateImage(picture, 'image/png'));
  oldStore.db.close();
  let server;
  t.after(async () => { if (server && server.exitCode === null) await stop(server); await rm(directory, { recursive: true, force: true }); });
  server = await start(db, port);
  const base = `http://127.0.0.1:${port}`, messagesPath = '/api/conversations/support-thread/messages';
  const api = (path, body, actor = 'customer') => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'X-Actor-Id': actor, ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  const list = async () => (await (await api(messagesPath)).json()).messages;
  assert.deepEqual(Buffer.from(await (await api('/api/attachments/' + old.attachment.id, undefined, 'support')).arrayBuffer()), picture);
  const oldLink = await (await api(`/api/attachments/${old.attachment.id}/link`, undefined, 'support')).json();
  assert.equal((await fetch(base + oldLink.url)).status, 200);
  const oldRetry = new FormData(); oldRetry.append('text', 'legacy image'); oldRetry.append('clientMessageId', 'before-upgrade');
  oldRetry.append('image', new Blob([picture], { type: 'image/png' }), 'photo.png');
  assert.equal((await (await api(messagesPath, oldRetry)).json()).message.id, old.id);
  const response = await api(messagesPath, form()); assert.equal(response.status, 201);
  const video = (await response.json()).message, attachment = video.attachment;
  assert.equal(attachment.kind, 'video'); assert.equal(attachment.mimeType, 'video/mp4');
  assert.equal(attachment.filename, 'leak.mp4'); assert.equal(attachment.durationSeconds, 2.75);
  assert.equal(attachment.storage.provider, 'local-s3'); assert.equal(attachment.storage.bucket, 'nearby-media');
  assert.equal(attachment.storage.uri, `s3://nearby-media/${attachment.storage.key}`);
  assert.equal(attachment.link, `/api/attachments/${attachment.id}`);
  assert.ok(!JSON.stringify(video).includes('token='));
  assert.deepEqual(await readFile(join(directory, 'objects', attachment.storage.bucket, attachment.storage.key)), mp4);
  assert.equal((await api(`/api/attachments/${attachment.id}/link`, undefined, 'pro-1')).status, 404);
  assert.equal((await fetch(base + '/api/media/' + attachment.id)).status, 403);
  const signed = await (await api(`/api/attachments/${attachment.id}/link`, undefined, 'support')).json();
  const full = await fetch(base + signed.url); assert.equal(full.status, 200); assert.deepEqual(Buffer.from(await full.arrayBuffer()), mp4);
  const head = await fetch(base + signed.url, { method: 'HEAD' }); assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(mp4.length)); assert.equal(head.headers.get('accept-ranges'), 'bytes');
  for (const [range, start, end] of [['bytes=100-199', 100, 199], ['bytes=-31', mp4.length - 31, mp4.length - 1], ['bytes=200-', 200, mp4.length - 1]]) {
    const part = await fetch(base + signed.url, { headers: { Range: range } });
    assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), `bytes ${start}-${end}/${mp4.length}`);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), mp4.subarray(start, end + 1));
  }
  for (const range of ['bytes=999999999-', 'bytes=20-10', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=a-b']) {
    const bad = await fetch(base + signed.url, { headers: { Range: range } });
    assert.equal(bad.status, 416); assert.equal(bad.headers.get('content-range'), `bytes */${mp4.length}`);
  }
  assert.equal((await fetch(base + signed.url.replace(/token=([^.]*)\./, 'token=$1x.'))).status, 403);
  assert.equal((await fetch(base + signed.url.replace('/api/media/' + attachment.id, '/api/media/' + old.attachment.id))).status, 403);
  const webmResponse = await api(messagesPath, form(webm, '', randomUUID(), 'video/webm'));
  assert.equal(webmResponse.status, 201); assert.equal((await webmResponse.json()).message.attachment.mimeType, 'video/webm');
  assert.equal((await api(messagesPath, form(Buffer.from('not a video')))).status, 400);
  assert.equal((await api(messagesPath, form(webm))).status, 400);
  const invalidDuration = form(); invalidDuration.set('durationSeconds', 'NaN'); assert.equal((await api(messagesPath, invalidDuration)).status, 400);
  const duplicate = form(); duplicate.append('media', new Blob([mp4], { type: 'video/mp4' }), 'other.mp4'); assert.equal((await api(messagesPath, duplicate)).status, 400);
  assert.deepEqual(await files(join(directory, '.upload-tmp')), []);
  await api('/api/dev/fault', { mode: 'before-save' }); const before = form(), count = (await list()).length;
  assert.equal((await api(messagesPath, before)).status, 503); assert.equal((await list()).length, count);
  assert.deepEqual(await files(join(directory, '.upload-tmp')), []); assert.equal((await api(messagesPath, before)).status, 201);
  await api('/api/dev/fault', { mode: 'after-save' }); const after = form();
  assert.equal((await api(messagesPath, after)).status, 503); const saved = (await list()).at(-1);
  const objectsBefore = await files(join(directory, 'objects', 'nearby-media'));
  assert.equal((await (await api(messagesPath, after)).json()).message.id, saved.id);
  assert.deepEqual(await files(join(directory, 'objects', 'nearby-media')), objectsBefore);
  const concurrent = form(); const replies = await Promise.all([api(messagesPath, concurrent), api(messagesPath, concurrent)]);
  assert.equal((await replies[0].json()).message.id, (await replies[1].json()).message.id);
  assert.deepEqual(await files(join(directory, '.upload-tmp')), []);
  await stop(server); server = await start(db, port);
  assert.equal((await fetch(base + signed.url)).status, 200); // signing secret survives restart
  assert.equal((await (await api(messagesPath, after)).json()).message.id, saved.id);
  const writer = new Store(db), conversation = writer.get('conversation', 'support-thread');
  writer.put('conversation', 'support-thread', { ...conversation, participantIds: ['customer'] }); writer.db.close();
  assert.equal((await fetch(base + signed.url)).status, 404); // revoke still applies to a signed link
  assert.equal((await api('/api/dev/reset', {})).status, 200);
  assert.deepEqual(await list(), []); assert.deepEqual(await files(join(directory, 'objects', 'nearby-media')), []);
  assert.deepEqual(await files(join(directory, 'uploads')), []); assert.deepEqual(await files(join(directory, '.upload-tmp')), []);
});

test('streamed 100 MiB video succeeds; oversized and interrupted uploads leave no files', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nearby-large-video-')), db = join(directory, 'chat.sqlite'), port = await freePort();
  let server = await start(db, port);
  t.after(async () => { if (server.exitCode === null) await stop(server); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`, path = '/api/conversations/support-thread/messages';
  async function upload(size) {
    const boundary = 'nearby-' + randomUUID();
    const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="large.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`), freeSize = size - mp4.length, box = Buffer.alloc(8);
    box.writeUInt32BE(freeSize); box.write('free', 4);
    const padding = Buffer.alloc(64 * 1024);
    async function* body() {
      yield prefix; yield mp4; yield box;
      let remaining = freeSize - box.length;
      while (remaining) { const bytes = Math.min(remaining, padding.length); yield padding.subarray(0, bytes); remaining -= bytes; }
      yield suffix;
    }
    return fetch(base + path, { method: 'POST', duplex: 'half', headers: {
      'X-Actor-Id': 'customer', 'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(prefix.length + size + suffix.length),
    }, body: Readable.from(body()) });
  }
  const size = 100 * 1024 * 1024;
  const response = await upload(size); assert.equal(response.status, 201);
  const media = (await response.json()).message.attachment;
  assert.equal(media.size, size);
  const signed = await (await fetch(base + `/api/attachments/${media.id}/link`, { headers: { 'X-Actor-Id': 'support' } })).json();
  const tail = await fetch(base + signed.url, { headers: { Range: `bytes=${size - 64}-` } });
  assert.equal(tail.status, 206); assert.deepEqual(Buffer.from(await tail.arrayBuffer()), Buffer.alloc(64));
  const oversize = await upload(size + 1); assert.equal(oversize.status, 413);
  assert.deepEqual(await files(join(directory, '.upload-tmp')), []);
  assert.equal((await files(join(directory, 'objects', 'nearby-media'))).length, 1);
  await new Promise((resolve) => {
    const request = httpRequest(base + path, { method: 'POST', headers: { 'X-Actor-Id': 'customer', 'Content-Type': 'multipart/form-data; boundary=interrupted' } });
    request.on('error', resolve);
    request.write('--interrupted\r\nContent-Disposition: form-data; name="media"; filename="broken.mp4"\r\nContent-Type: video/mp4\r\n\r\n');
    request.write(mp4);
    setTimeout(() => request.destroy(new Error('simulated disconnection')), 30);
  });
  await delay(50);
  assert.deepEqual(await files(join(directory, '.upload-tmp')), []);
  assert.equal((await files(join(directory, 'objects', 'nearby-media'))).length, 1);
  const malformed = await fetch(base + path, { method: 'POST', headers: { 'X-Actor-Id': 'customer', 'Content-Type': 'multipart/form-data; boundary=broken' }, body: '--broken\r\ninvalid' });
  assert.equal(malformed.status, 400);
});

test('expired and malformed links, range boundaries, and object rollback', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nearby-link-test-')), store = new Store(join(directory, 'chat.sqlite'));
  t.after(async () => { store.db.close(); await rm(directory, { recursive: true, force: true }); });
  let now = 1000;
  const links = new MediaLinks(store, 1, () => now), generated = links.create('attachment-1', 'customer');
  const token = new URL(generated.url, 'http://localhost').searchParams.get('token');
  assert.equal(links.verify('attachment-1', token), 'customer'); now = 2000;
  assert.throws(() => links.verify('attachment-1', token), (error) => error.status === 403 && /expired/.test(error.message));
  store.reset(); now = 1000;
  assert.equal(new MediaLinks(store, 1, () => now).verify('attachment-1', token), 'customer');
  const payload = token.split('.')[0];
  for (const invalid of [null, '.', payload + '.' + 'é'.repeat(43), payload + '.' + 'a'.repeat(43)])
    assert.throws(() => links.verify('attachment-1', invalid), (error) => error.status === 403);
  assert.deepEqual(byteRange('bytes=0-9999', 100), { start: 0, end: 99 });
  assert.deepEqual(byteRange('bytes=-9999', 100), { start: 0, end: 99 });
  assert.throws(() => byteRange('bytes=9007199254740993-', 100), (error) => error.status === 416);
  const temporaryPath = join(directory, 'staged.mp4'); await writeFile(temporaryPath, mp4);
  store.db.exec("CREATE TRIGGER fail_message BEFORE INSERT ON records WHEN NEW.kind='message' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  assert.throws(() => new Chat(store).send('customer', 'support-thread', { text: 'rollback' }, {
    temporaryPath, mimeType: 'video/mp4', kind: 'video', size: mp4.length, sha256: 'ab'.repeat(32), filename: 'test.mp4',
  }));
  assert.deepEqual(store.messages('support-thread'), []); assert.deepEqual(store.all('attachment'), []);
  assert.deepEqual(await files(join(directory, 'objects', 'nearby-media')), []);
});

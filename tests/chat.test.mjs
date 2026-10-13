import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID, randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { Store } from '../src/store.ts';
import { Chat } from '../src/chat.ts';
import { validateImage } from '../src/attachments.ts';

// A valid, uncompressed RGB PNG larger than 10 MiB, including correct chunk CRCs.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([label, data])));
  return Buffer.concat([length, label, data, crc]);
}
function png(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const pixels = randomBytes((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}
const small = png(2, 2);
const large = png(2048, 1800);

async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve)); return port;
}
async function start(db, port) {
  const process = spawn(globalThis.process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: new URL('..', import.meta.url), env: { ...globalThis.process.env, PORT: String(port), CHAT_DB: db },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; process.stderr.on('data', (chunk) => { log += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start: ' + log)), 5000);
    process.stdout.on('data', (chunk) => { if (String(chunk).includes('Nearby Chat')) { clearTimeout(timer); resolve(); } });
    process.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited: ' + log)); });
  });
  return process;
}
async function stop(process) { const exited = once(process, 'exit'); process.kill('SIGTERM'); await exited; }

test('existing chat and image HTTP flow, faults, deduplication, persistence and isolation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nearby-images-'));
  const db = join(directory, 'chat.sqlite'), port = await freePort();
  let server;
  t.after(async () => { if (server && server.exitCode === null) await stop(server); await rm(directory, { recursive: true, force: true }); });
  server = await start(db, port);
  const base = `http://127.0.0.1:${port}`;
  const request = (path, body, actor = 'customer') => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Actor-Id': actor, ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  const send = (body, actor) => request('/api/conversations/support-thread/messages', body, actor);
  const imageBody = (bytes = small, text = '', id = randomUUID(), type = 'image/png') => {
    const body = new FormData(); body.append('text', text); body.append('clientMessageId', id);
    body.append('image', new Blob([bytes], { type }), 'photo.png'); return body;
  };
  const messages = async (actor = 'customer') => (await (await request('/api/conversations/support-thread/messages', undefined, actor)).json()).messages;
  assert.equal((await request('/health')).status, 200);
  assert.equal((await request('/api/state', undefined, 'nobody')).status, 401);
  assert.deepEqual((await (await request('/api/state', undefined, 'pro-1')).json()).conversations, []);
  assert.equal((await send({ text: '  hello  ' })).status, 201);
  assert.equal((await send({ text: 'Reply' }, 'support')).status, 201);
  assert.equal((await messages('support'))[0].text, 'hello');
  assert.equal((await send({ text: '' })).status, 400);
  assert.equal((await send({ text: 'x'.repeat(4001) })).status, 400);
  assert.equal((await send({ text: 'unauthorized' }, 'pro-1')).status, 404);
  assert.equal((await send(imageBody(small, ' '.repeat(4001)))).status, 400);
  assert.equal((await send(imageBody(Buffer.from('fake png')))).status, 400);
  assert.equal((await send(imageBody(small, '', randomUUID(), 'image/jpeg'))).status, 400);
  assert.equal((await send(imageBody(small.subarray(0, -12)))).status, 400);
  assert.equal((await send(imageBody(Buffer.alloc(15 * 1024 * 1024 + 1)))).status, 413);
  const duplicates = imageBody(); duplicates.append('image', new Blob([small], { type: 'image/png' }), 'second.png');
  assert.equal((await send(duplicates)).status, 400);
  assert.ok(large.length > 10 * 1024 * 1024);
  const largeResponse = await send(imageBody(large, 'Under the sink; leaking since morning.'));
  assert.equal(largeResponse.status, 201);
  const largeMessage = (await largeResponse.json()).message;
  assert.equal(largeMessage.attachment.size, large.length);
  const path = '/api/attachments/' + largeMessage.attachment.id;
  const photo = await request(path, undefined, 'support');
  assert.equal(photo.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), large);
  assert.equal((await request(path, undefined, 'pro-1')).status, 404);
  assert.equal((await request(path, undefined, 'pro-2')).status, 404);
  assert.equal((await fetch(base + path)).status, 401);
  assert.equal((await fetch(base + '/uploads/' + largeMessage.attachment.id)).status, 401);
  assert.equal((await send(imageBody())).status, 201);
  await request('/api/dev/fault', { mode: 'before-save' });
  const before = imageBody(); const count = (await messages()).length;
  assert.equal((await send(before)).status, 503);
  assert.equal((await messages()).length, count);
  assert.equal((await send(before)).status, 201);
  await request('/api/dev/fault', { mode: 'after-save' });
  const retryId = randomUUID(), after = imageBody(small, 'retry image', retryId);
  assert.equal((await send(after)).status, 503);
  const saved = (await messages()).at(-1);
  const filesBefore = await readdir(join(directory, 'objects', 'nearby-media'));
  const retried = await send(after);
  assert.equal(retried.status, 201);
  assert.equal((await retried.json()).message.id, saved.id);
  assert.deepEqual(await readdir(join(directory, 'objects', 'nearby-media')), filesBefore);
  assert.equal((await send(imageBody(small, 'changed', retryId))).status, 409);
  const parallel = imageBody(small, 'one concurrent image');
  const responses = await Promise.all([send(parallel), send(parallel)]);
  assert.equal((await responses[0].json()).message.id, (await responses[1].json()).message.id);
  await request('/api/dev/fault', { mode: 'after-save' });
  const textRetry = { text: 'retry text', clientMessageId: randomUUID() };
  assert.equal((await send(textRetry)).status, 503);
  const textSaved = (await messages()).at(-1);
  assert.equal((await (await send(textRetry)).json()).message.id, textSaved.id);
  await request('/api/dev/fault', { mode: 'before-save' });
  assert.equal((await send({ text: 'support unaffected' }, 'support')).status, 201);
  assert.equal((await send({ text: 'customer fault' })).status, 503);
  await stop(server); server = await start(db, port);
  assert.deepEqual(Buffer.from(await (await request(path, undefined, 'support')).arrayBuffer()), large);
  assert.equal((await (await send(after)).json()).message.id, saved.id);
  assert.equal((await request('/api/dev/reset', {})).status, 200);
  assert.deepEqual(await messages(), []);
  assert.deepEqual(await readdir(join(directory, 'objects', 'nearby-media')), []);
  assert.equal((await request(path)).status, 404);
  assert.equal((await send({ text: 'after reset' })).status, 201);
});

test('database failures leave neither a message nor an image file', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nearby-rollback-'));
  const store = new Store(join(directory, 'chat.sqlite'));
  t.after(async () => { store.db.close(); await rm(directory, { recursive: true, force: true }); });
  store.db.exec("CREATE TRIGGER fail_message BEFORE INSERT ON records WHEN NEW.kind='message' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  const chat = new Chat(store);
  assert.throws(() => chat.send('customer', 'support-thread', { text: 'photo', clientMessageId: 'rollback' }, validateImage(small, 'image/png')));
  assert.deepEqual(store.messages('support-thread'), []);
  assert.deepEqual(store.all('attachment'), []);
  assert.deepEqual(store.all('send-request'), []);
  assert.deepEqual(await readdir(join(directory, 'uploads')), []);
});

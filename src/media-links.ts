import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { HttpError } from "./errors.ts";
import type { Store } from "./store.ts";
import type { Attachment } from "./types.ts";

export class MediaLinks {
  private readonly secret: string;
  constructor(store: Store, readonly ttlSeconds = 900, readonly now = () => Date.now()) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) throw new Error("Invalid media link lifetime");
    this.secret = store.get<string>("meta", "media-signing-secret") ?? randomBytes(32).toString("hex");
    store.put("meta", "media-signing-secret", this.secret);
  }
  private signature(payload: string) { return createHmac("sha256", this.secret).update(payload).digest("base64url"); }
  create(attachmentId: string, actor: string) {
    const expiresAt = this.now() + this.ttlSeconds * 1000;
    const payload = Buffer.from(JSON.stringify({ attachmentId, actor, expiresAt })).toString("base64url");
    return { url: `/api/media/${attachmentId}?token=${payload}.${this.signature(payload)}`, expiresAt: new Date(expiresAt).toISOString() };
  }
  verify(attachmentId: string, token: string | null): string {
    if (!token || token.length > 2048) throw new HttpError(403, "Invalid media link.");
    const [payload, signature, extra] = token.split(".");
    const expected = this.signature(payload);
    if (!signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature) || signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new HttpError(403, "Invalid media link.");
    let claims: { attachmentId?: unknown; actor?: unknown; expiresAt?: unknown };
    try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
    catch { throw new HttpError(403, "Invalid media link."); }
    if (!claims || claims.attachmentId !== attachmentId || typeof claims.actor !== "string" ||
        typeof claims.expiresAt !== "number" || !Number.isFinite(claims.expiresAt)) throw new HttpError(403, "Invalid media link.");
    if (claims.expiresAt <= this.now()) throw new HttpError(403, "Media link expired. Refresh the link to continue.");
    return claims.actor;
  }
}

export function byteRange(range: string | undefined, size: number): { start: number; end: number } | undefined {
  if (!range) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) throw new HttpError(416, "Invalid byte range.");
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new HttpError(416, "Invalid byte range.");
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start)
    throw new HttpError(416, "Invalid byte range.");
  return { start, end: Math.min(end, size - 1) };
}

export async function serveAttachment(req: IncomingMessage, res: ServerResponse, store: Store, attachment: Attachment): Promise<void> {
  let size: number;
  try {
    size = attachment.storage ? store.objects.size(attachment.storage.key) : statSync(join(store.files.directory, attachment.id)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(404, "Attachment file not found.");
    throw error;
  }
  let range;
  try { range = byteRange(req.headers.range, size); }
  catch (error) {
    res.setHeader("Content-Range", `bytes */${size}`);
    throw error;
  }
  res.writeHead(range ? 206 : 200, {
    "Content-Type": attachment.mimeType,
    "Content-Length": range ? range.end - range.start + 1 : size,
    "Accept-Ranges": "bytes",
    ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` } : {}),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (req.method === "HEAD") { res.end(); return; }
  const stream = attachment.storage ? store.objects.open(attachment.storage.key, range)
    : createReadStream(join(store.files.directory, attachment.id), range);
  await pipeline(stream, res);
}

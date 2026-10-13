import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Store } from "./store.ts";
import { Chat, HttpError } from "./chat.ts";
import type { Fault } from "./types.ts";
import { parseMediaUpload, type PreparedMedia } from "./media-upload.ts";
import { removeFile } from "./media-storage.ts";
import { MediaLinks, serveAttachment } from "./media-links.ts";

const store = new Store(process.env.CHAT_DB ?? ".data/chat-v2.sqlite");
const chat = new Chat(store);
const links = new MediaLinks(store, Number(process.env.MEDIA_LINK_TTL_SECONDS ?? 900));
const faults = new Map<string, Fault>();
const assets: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};
const server = createServer(async (req, res) => {
  let media: PreparedMedia | undefined;
  const reply = (status: number, data: unknown) => {
    if (res.headersSent || res.destroyed) return;
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && assets[url.pathname]) {
      const [file, type] = assets[url.pathname];
      const content = await readFile(
        fileURLToPath(new URL("../tools/workbench/" + file, import.meta.url)),
      );
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(content);
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      reply(200, { ok: true, exercise: "chat-v2" });
      return;
    }
    const mediaRoute = url.pathname.match(/^\/api\/media\/([\w-]+)$/);
    if (mediaRoute && ["GET", "HEAD"].includes(req.method ?? "")) {
      const signedActor = links.verify(mediaRoute[1], url.searchParams.get("token"));
      chat.person(signedActor);
      await serveAttachment(req, res, store, chat.attachment(signedActor, mediaRoute[1]));
      return;
    }
    const actor =
      typeof req.headers["x-actor-id"] === "string"
        ? req.headers["x-actor-id"]
        : "";
    chat.person(actor);
    const messages = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (messages) chat.conversation(actor, messages[1]);
    const attachmentRoute = url.pathname.match(/^\/api\/attachments\/([\w-]+)(\/link)?$/);
    if (attachmentRoute && ["GET", "HEAD"].includes(req.method ?? "")) {
      const attachment = chat.attachment(actor, attachmentRoute[1]);
      if (attachmentRoute[2] && req.method === "GET") reply(200, links.create(attachment.id, actor));
      else if (!attachmentRoute[2]) await serveAttachment(req, res, store, attachment);
      else throw new HttpError(404, "Route not found.");
      return;
    }
    let body: any = {};
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method ?? "")) {
      const multipart = (req.headers["content-type"] ?? "").toLowerCase().startsWith("multipart/form-data");
      if (multipart) {
        if (!messages || req.method !== "POST") {
          req.resume(); throw new HttpError(400, "Media uploads belong to a conversation message.");
        }
        const parsed = await parseMediaUpload(req, store.temporaryDirectory);
        body = parsed.body;
        media = parsed.media;
      } else {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) throw new HttpError(413, "Request too large.");
          chunks.push(Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks);
        try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; }
        catch { throw new HttpError(400, "Invalid JSON."); }
      }
      if (!body || Array.isArray(body) || typeof body !== "object")
        throw new HttpError(400, "Expected a JSON object.");
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      reply(200, chat.state(actor));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/dev/reset") {
      store.reset();
      faults.clear();
      reply(200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/dev/fault") {
      if (!["none", "before-save", "after-save"].includes(body.mode))
        throw new HttpError(400, "Unknown failure mode.");
      faults.set(actor, body.mode);
      reply(200, { mode: body.mode });
      return;
    }
    if (messages && req.method === "GET") {
      reply(200, { messages: chat.messages(actor, messages[1]) });
      return;
    }
    if (messages && req.method === "POST") {
      chat.conversation(actor, messages[1]);
      const fault = faults.get(actor);
      faults.delete(actor);
      if (fault === "before-save")
        throw new HttpError(
          503,
          "Connection failed before the message was saved.",
        );
      const message = chat.send(actor, messages[1], body, media);
      if (fault === "after-save")
        throw new HttpError(
          503,
          "Connection lost. The server saved the message, but the sender did not receive confirmation.",
        );
      reply(201, { message });
      return;
    }
    throw new HttpError(404, "Route not found.");
  } catch (e) {
    if (!(e instanceof HttpError) && !res.destroyed) console.error(e);
    reply(e instanceof HttpError ? e.status : 500, {
      error: e instanceof HttpError ? e.message : "Unexpected server error.",
    });
  } finally {
    if (media) removeFile(media.temporaryPath);
  }
});
server.listen(Number(process.env.PORT ?? 4310), "127.0.0.1", () =>
  console.log("Nearby Chat · http://127.0.0.1:" + (process.env.PORT ?? 4310)),
);
function stop() {
  server.close(() => {
    store.db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

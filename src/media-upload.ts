import busboy from "busboy";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join, basename } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MAX_IMAGE_BYTES, validateImage } from "./attachments.ts";
import { HttpError } from "./errors.ts";
import { removeFile } from "./media-storage.ts";
import type { Attachment } from "./types.ts";

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_MEDIA_REQUEST_BYTES = MAX_VIDEO_BYTES + 1024 * 1024;
export type PreparedMedia = {
  temporaryPath: string;
  mimeType: Attachment["mimeType"];
  kind: "image" | "video";
  size: number;
  sha256: string;
  filename: string;
  durationSeconds?: number;
};

export function videoMime(header: Buffer): "video/mp4" | "video/webm" {
  if (header.length >= 16 && header.toString("ascii", 4, 8) === "ftyp") {
    const boxSize = header.readUInt32BE(0);
    const brands = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "av01", "dash", "M4V "]);
    if (boxSize >= 16 && boxSize <= header.length) {
      for (let position = 8; position + 4 <= boxSize; position += 4) {
        if (position === 12) continue; // minor version, not a brand
        if (brands.has(header.toString("ascii", position, position + 4))) return "video/mp4";
      }
    }
  }
  // The EBML DocType must be webm, not an arbitrary Matroska container.
  if (header.length >= 16 && header.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex")) &&
      header.includes(Buffer.from("4282847765626d", "hex"))) return "video/webm";
  throw new HttpError(400, "Choose an MP4 or WebM video.");
}

export async function parseMediaUpload(req: IncomingMessage, temporaryDirectory: string): Promise<{
  body: { text?: string; clientMessageId?: string };
  media?: PreparedMedia;
}> {
  const length = Number(req.headers["content-length"]);
  if (Number.isFinite(length) && length > MAX_MEDIA_REQUEST_BYTES) {
    req.resume();
    throw new HttpError(413, "Request too large.");
  }
  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({ headers: req.headers, defParamCharset: "utf8", limits: {
      // busboy emits partsLimit when the limit is reached, so allow four valid parts and reject a fifth.
      files: 1, fields: 3, parts: 5, fieldSize: 16000, fileSize: MAX_VIDEO_BYTES + 1,
    } });
  } catch { req.resume(); throw new HttpError(400, "Invalid media upload."); }
  const fields = new Map<string, string>(), temporaryPaths: string[] = [], jobs: Promise<void>[] = [];
  let media: PreparedMedia | undefined, failure: Error | undefined, total = 0;
  const fail = (error: Error) => { failure ??= error; };
  const totalLimit = new Transform({ transform(chunk, _encoding, callback) {
    total += chunk.length;
    callback(total > MAX_MEDIA_REQUEST_BYTES ? new HttpError(413, "Request too large.") : null, chunk);
  } });
  parser.on("field", (name, value, info) => {
    if (!["text", "clientMessageId", "durationSeconds"].includes(name) || fields.has(name) || info.valueTruncated)
      fail(new HttpError(400, "Invalid or repeated message fields."));
    else fields.set(name, value);
  });
  parser.on("filesLimit", () => fail(new HttpError(400, "Send at most one image or video.")));
  parser.on("fieldsLimit", () => fail(new HttpError(400, "Too many message fields.")));
  parser.on("partsLimit", () => fail(new HttpError(400, "Too many message parts.")));
  parser.on("file", (name, file, info) => {
    if (!["image", "video", "media"].includes(name)) {
      fail(new HttpError(400, "Choose an image or video file.")); file.resume(); return;
    }
    const isVideo = info.mimeType.startsWith("video/");
    if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(info.mimeType) ||
        (name === "image" && isVideo) || (name === "video" && !isVideo)) {
      fail(new HttpError(400, "Choose a JPEG, PNG, WebP, MP4 or WebM file.")); file.resume(); return;
    }
    try { mkdirSync(temporaryDirectory, { recursive: true }); }
    catch (error) { fail(error as Error); file.resume(); return; }
    const temporaryPath = join(temporaryDirectory, randomUUID());
    temporaryPaths.push(temporaryPath);
    const hash = createHash("sha256");
    let size = 0, header = Buffer.alloc(0);
    file.on("limit", () => fail(new HttpError(413, "Videos must be 100 MiB or smaller.")));
    const inspect = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
        callback(new HttpError(413, isVideo ? "Videos must be 100 MiB or smaller." : "Images must be 15 MiB or smaller."));
        return;
      }
      hash.update(chunk);
      if (header.length < 8192) header = Buffer.concat([header, chunk.subarray(0, 8192 - header.length)]);
      callback(null, chunk);
    } });
    // Catch immediately so a failed file never becomes an unhandled rejection.
    jobs.push(pipeline(file, inspect, createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }))
      .then(() => {
        if (failure) return;
        if (isVideo) {
          if (!size || videoMime(header) !== info.mimeType) throw new HttpError(400, "Video content does not match its file type.");
        } else validateImage(readFileSync(temporaryPath), info.mimeType);
        media = { temporaryPath, mimeType: info.mimeType as Attachment["mimeType"], kind: isVideo ? "video" : "image",
          size, sha256: hash.digest("hex"), filename: basename(info.filename ?? "attachment").replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180) || "attachment" };
      }).catch((error: Error) => {
        fail(error);
        // A destroyed file stream cannot be left blocking the multipart parser.
        parser.destroy(error);
      }));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        req.unpipe(totalLimit); totalLimit.unpipe(parser);
        req.resume(); parser.destroy();
      };
      parser.once("close", resolve);
      parser.once("error", (error) => { abort(); reject(error); });
      totalLimit.once("error", (error) => { abort(); reject(error); });
      req.once("aborted", () => { abort(); reject(new HttpError(400, "Upload interrupted.")); });
      req.once("error", (error) => { abort(); reject(error); });
      req.pipe(totalLimit).pipe(parser);
    });
    await Promise.all(jobs);
    if (failure) throw failure;
    const duration = fields.get("durationSeconds");
    if (duration !== undefined) {
      const seconds = Number(duration);
      if (!media || media.kind !== "video" || !duration || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86400)
        throw new HttpError(400, "Invalid video duration.");
      media.durationSeconds = seconds;
    }
    const body: { text?: string; clientMessageId?: string } = {};
    if (fields.has("text")) body.text = fields.get("text");
    if (fields.has("clientMessageId")) body.clientMessageId = fields.get("clientMessageId");
    return { body, media };
  } catch (error) {
    await Promise.all(jobs);
    for (const path of temporaryPaths) removeFile(path);
    if (error instanceof HttpError) throw error;
    if ((error as NodeJS.ErrnoException).code) throw error; // preserve real storage failures
    throw new HttpError(400, "Invalid or interrupted media upload.");
  }
}

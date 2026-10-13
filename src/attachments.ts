import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError } from "./errors.ts";
import type { Attachment } from "./types.ts";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 1024 * 1024;
export type ImageUpload = { bytes: Buffer; mimeType: Attachment["mimeType"] };

export function validateImage(bytes: Buffer, declaredType: string): ImageUpload {
  if (!bytes.length) throw new HttpError(400, "Choose a non-empty image.");
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new HttpError(413, "Images must be 15 MiB or smaller.");
  let mimeType: Attachment["mimeType"] | undefined;
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
      bytes.toString("ascii", 12, 16) === "IHDR" &&
      bytes.subarray(-12).equals(Buffer.from("0000000049454e44ae426082", "hex")))
    mimeType = "image/png";
  else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9)
    mimeType = "image/jpeg";
  else if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length &&
      ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16)))
    mimeType = "image/webp";
  if (!mimeType || (declaredType && declaredType !== mimeType))
    throw new HttpError(400, "Choose a JPEG, PNG or WebP image with a matching file type.");
  return { bytes, mimeType };
}

export class AttachmentFiles {
  constructor(readonly directory: string) {}
  save(bytes: Buffer): string {
    mkdirSync(this.directory, { recursive: true });
    const id = randomUUID();
    try { writeFileSync(join(this.directory, id), bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) { this.remove(id); throw error; }
    return id;
  }
  read(id: string): Buffer {
    return readFileSync(join(this.directory, id));
  }
  remove(id: string): void {
    try { unlinkSync(join(this.directory, id)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

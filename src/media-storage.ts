import { randomUUID } from "node:crypto";
import { createReadStream, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ReadStream } from "node:fs";
import type { Attachment, StorageReference } from "./types.ts";

// S3-shaped contract: replace this adapter to use a cloud bucket later.
export interface ObjectStorage {
  put(temporaryPath: string): StorageReference;
  open(key: string, range?: { start: number; end: number }): ReadStream;
  size(key: string): number;
  delete(key: string): void;
}
export class LocalS3Storage implements ObjectStorage {
  readonly bucket = "nearby-media";
  constructor(readonly root: string) {}
  private path(key: string): string {
    if (!/^[\w-]+$/.test(key)) throw new Error("Invalid object key");
    return join(this.root, this.bucket, key);
  }
  put(temporaryPath: string): StorageReference {
    const key = randomUUID();
    mkdirSync(join(this.root, this.bucket), { recursive: true });
    renameSync(temporaryPath, this.path(key));
    return { provider: "local-s3", bucket: this.bucket, key, uri: `s3://${this.bucket}/${key}` };
  }
  open(key: string, range?: { start: number; end: number }) { return createReadStream(this.path(key), range); }
  size(key: string) { return statSync(this.path(key)).size; }
  delete(key: string) { removeFile(this.path(key)); }
}
export function removeFile(path: string): void {
  try { unlinkSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
export function attachmentKind(attachment: Attachment): "image" | "video" {
  return attachment.mimeType.startsWith("video/") ? "video" : "image";
}

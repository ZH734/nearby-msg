import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Person, Conversation, Message, Attachment } from "./types.ts";
import { AttachmentFiles } from "./attachments.ts";
import { LocalS3Storage } from "./media-storage.ts";

export const people: Person[] = [
  {
    id: "customer",
    name: "Alex",
    role: "customer",
    description: "Needs help with a leaking kitchen sink",
  },
  {
    id: "pro-1",
    name: "Jordan",
    role: "professional",
    description: "Plumber · available today",
  },
  {
    id: "pro-2",
    name: "Sam",
    role: "professional",
    description: "Plumber · available tomorrow",
  },
  {
    id: "support",
    name: "Nearby Support",
    role: "support",
    description: "Platform customer service",
  },
];

export class Store {
  readonly db: DatabaseSync;
  readonly files: AttachmentFiles;
  readonly objects: LocalS3Storage;
  readonly temporaryDirectory: string;
  constructor(path: string) {
    this.files = new AttachmentFiles(dirname(path) + "/uploads");
    this.objects = new LocalS3Storage(dirname(path) + "/objects");
    this.temporaryDirectory = dirname(path) + "/.upload-tmp";
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));`);
    if (!this.get("meta", "initialized")) this.reset();
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? (JSON.parse(String(row.data)) as T) : undefined;
  }
  all<T>(kind: string): T[] {
    return this.db
      .prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid")
      .all(kind)
      .map((r) => JSON.parse(String(r.data)) as T);
  }
  put<T>(kind: string, id: string, value: T): void {
    this.db
      .prepare(
        "INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(kind, id, JSON.stringify(value));
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  conversations(): Conversation[] {
    return this.all<Conversation>("conversation");
  }
  messages(conversationId: string): Message[] {
    return this.all<Message>("message").filter(
      (m) => m.conversationId === conversationId,
    );
  }
  reset(): void {
    const attachments = this.all<Attachment>("attachment");
    const signingSecret = this.get<string>("meta", "media-signing-secret");
    this.transaction(() => {
      this.db.exec("DELETE FROM records");
      this.put("meta", "initialized", true);
      if (signingSecret) this.put("meta", "media-signing-secret", signingSecret);
      this.put<Conversation>("conversation", "support-thread", {
        id: "support-thread",
        participantIds: ["customer", "support"],
        createdAt: new Date().toISOString(),
      });
    });
    for (const attachment of attachments) {
      if (attachment.storage) this.objects.delete(attachment.storage.key);
      else this.files.remove(attachment.id);
    }
  }
}

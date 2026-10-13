import { createHash, randomUUID } from "node:crypto";
import { Store, people } from "./store.ts";
import type { Attachment, Conversation, Message } from "./types.ts";
import type { ImageUpload } from "./attachments.ts";
import type { PreparedMedia } from "./media-upload.ts";
import { readFileSync } from "node:fs";
import { HttpError } from "./errors.ts";
export { HttpError } from "./errors.ts";

export function requireText(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 4000)
    throw new HttpError(400, "Enter a message between 1 and 4,000 characters.");
  return value.trim();
}
export class Chat {
  constructor(readonly store: Store) {}
  person(id: string) {
    const person = people.find((p) => p.id === id);
    if (!person) throw new HttpError(401, "Choose a valid demo identity.");
    return person;
  }
  conversation(actor: string, id: string): Conversation {
    const conversation = this.store.get<Conversation>("conversation", id);
    if (!conversation || !conversation.participantIds.includes(actor))
      throw new HttpError(404, "Conversation not found.");
    return conversation;
  }
  state(actor: string) {
    const person = this.person(actor);
    return {
      person,
      people,
      conversations: this.store
        .conversations()
        .filter((c) => c.participantIds.includes(actor)),
    };
  }
  messages(actor: string, id: string) {
    this.conversation(actor, id);
    return this.store.messages(id);
  }
  attachment(actor: string, id: string): Attachment {
    const attachment = this.store.get<Attachment>("attachment", id);
    if (!attachment) throw new HttpError(404, "Attachment not found.");
    this.conversation(actor, attachment.conversationId);
    return attachment;
  }
  send(actor: string, id: string, body: { text?: unknown; clientMessageId?: unknown }, image?: ImageUpload | PreparedMedia): Message {
    this.conversation(actor, id);
    if (image && body.text !== undefined && (typeof body.text !== "string" || body.text.length > 4000))
      throw new HttpError(400, "Enter a message between 1 and 4,000 characters.");
    const text = image && (body.text === undefined || body.text === "" ||
      (typeof body.text === "string" && !body.text.trim())) ? "" : requireText(body.text);
    const requestId = body.clientMessageId;
    if (requestId !== undefined && (typeof requestId !== "string" || !/^[\w-]{1,128}$/.test(requestId)))
      throw new HttpError(400, "Invalid client message ID.");
    const key = requestId === undefined ? undefined : JSON.stringify([actor, id, requestId]);
    const prepared = image && "temporaryPath" in image ? image : undefined;
    // Keep the previous image fingerprint so unchanged drafts can retry across this upgrade.
    const content = prepared ? (prepared.kind === "image" ? readFileSync(prepared.temporaryPath) : Buffer.from(prepared.sha256, "hex"))
      : image && "bytes" in image ? image.bytes : Buffer.alloc(0);
    const fingerprint = createHash("sha256").update(JSON.stringify([text, image?.mimeType]))
      .update(content).digest("hex");
    if (key) {
      const previous = this.store.get<{ fingerprint: string; messageId: string }>("send-request", key);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new HttpError(409, "This send ID was already used for different content.");
        const message = this.store.get<Message>("message", previous.messageId);
        if (!message) throw new HttpError(409, "Message no longer exists.");
        return message;
      }
    }
    const message: Message = {
      id: randomUUID(),
      conversationId: id,
      senderId: actor,
      text,
      createdAt: new Date().toISOString(),
    };
    let fileId: string | undefined;
    let objectKey: string | undefined;
    try {
      if (prepared) {
        const storage = this.store.objects.put(prepared.temporaryPath);
        objectKey = storage.key;
        const attachmentId = randomUUID();
        message.attachment = { id: attachmentId, conversationId: id, messageId: message.id,
          mimeType: prepared.mimeType, kind: prepared.kind, size: prepared.size, filename: prepared.filename,
          ...(prepared.durationSeconds === undefined ? {} : { durationSeconds: prepared.durationSeconds }),
          storage, link: `/api/attachments/${attachmentId}`, createdAt: message.createdAt };
      } else if (image && "bytes" in image) {
        fileId = this.store.files.save(image.bytes);
        message.attachment = { id: fileId, conversationId: id, messageId: message.id,
          mimeType: image.mimeType, size: image.bytes.length };
      }
      this.store.transaction(() => {
        if (message.attachment) this.store.put("attachment", message.attachment.id, message.attachment);
        this.store.put("message", message.id, message);
        if (key) this.store.put("send-request", key, { fingerprint, messageId: message.id });
      });
    } catch (error) {
      if (fileId) this.store.files.remove(fileId);
      if (objectKey) this.store.objects.delete(objectKey);
      throw error;
    }
    return message;
  }
}

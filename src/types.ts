export type Person = {
  id: string;
  name: string;
  role: "customer" | "professional" | "support";
  description: string;
};
export type Conversation = {
  id: string;
  participantIds: string[];
  createdAt: string;
};
export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
  attachment?: Attachment;
};
export type Attachment = {
  id: string;
  conversationId: string;
  messageId: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm";
  size: number;
  kind?: "image" | "video";
  filename?: string;
  durationSeconds?: number;
  storage?: StorageReference;
  link?: string;
  createdAt?: string;
};
export type StorageReference = {
  provider: "local-s3";
  bucket: string;
  key: string;
  uri: string;
};
export type Fault = "none" | "before-save" | "after-save";

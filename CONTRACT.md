# Starter API reference

This describes the existing starter, not a prescribed design for your solution. Extend or change the model and routes to fit your chosen scope, and document any changes needed to run or verify it.

## Demo identities

All `/api/*` requests use `X-Actor-Id`: `customer` (Alex), `pro-1` (Jordan), `pro-2` (Sam), or `support` (Nearby Support).

The switcher simulates identity, not production authentication. Requests still check conversation membership. The starter derives message senders from the chosen identity.

## Initial state

One empty `support-thread` with participants `customer` and `support`. Professionals have no conversations. SQLite persists across restart. There are no seeded messages or automatic replies.

`Conversation`: `{id, participantIds, createdAt}`.

`Message`: `{id, conversationId, senderId, text, createdAt, attachment?}`. An optional `attachment` includes `{id, conversationId, messageId, mimeType, size}`. New attachments also include `kind`, `filename`, `createdAt`, a stable authorized `link`, and `storage: {provider:"local-s3", bucket, key, uri}`. Video `durationSeconds` is optional, supplied by the browser for display. Old image metadata and text-only messages remain valid without migration.

## Existing routes

| Method / route | Body → response |
| --- | --- |
| `GET /health` | `{ok:true, exercise:"chat-v2"}` |
| `GET /api/state` | `{person, people, conversations}` — only the current actor's conversations |
| `GET /api/conversations/:id/messages` | `{messages}` — oldest first |
| `POST /api/conversations/:id/messages` | JSON `{text, clientMessageId?}` or multipart fields `text?`, one of `media?` / legacy `image?` / `video?`, `clientMessageId?`, `durationSeconds?` → `{message}` (201) |
| `GET /api/attachments/:id`, `HEAD` | Media bytes, authorized by identity and conversation membership; supports byte ranges |
| `GET /api/attachments/:id/link` | `{url, expiresAt}` — short-lived signed playback link for an authorized participant |
| `GET /api/media/:id?token=…`, `HEAD` | Streaming media through a valid signed link; supports byte ranges and rechecks the signing actor’s membership |
| `POST /api/dev/fault` | `{mode:"none"\|"before-save"\|"after-save"}` — one-shot fault for current actor |
| `POST /api/dev/reset` | `{}` → `{ok:true}` — resets chat data and faults |

The text endpoint trims text and accepts 1–4,000 characters. Image/video messages can omit text. JSON requests remain limited to 8 MiB; multipart requests are limited to 101 MiB, with one JPEG, PNG or WebP image at most 15 MiB, or one MP4/WebM video at most 100 MiB. New uploads are parsed with bounded streaming buffers into temporary files; videos are never collected into a full in-memory buffer. The server checks recognized image headers/trailers or video container headers against the declared MIME type, not a complete frame decode; the browser verifies that the selected image or first video frame decodes. MP4/WebM container support still depends on the browser’s supported codecs; no transcoding is performed. Uploads and messages use the same send endpoint. A successful response means both the local file and database records were saved. Invalid input returns 400; inaccessible conversations return 404. Errors are JSON `{error: string}`. Unknown routes return 404. These describe current implementation choices; you can revise them where your design requires it.

## Connection simulation

The UI's simulation controls affect the next send from the selected identity:

- `before-save`: returns 503 without saving the message.
- `after-save`: saves the message, then returns 503 instead of confirmation.
- `none`: normal behavior.

Each fault is consumed once. There is no automatic retry. The UI preserves the draft and image after an unconfirmed send. Each new draft submission gets a `clientMessageId`; retrying unchanged content uses the same ID. IDs are scoped to actor and conversation and persisted, so an identical retry returns the original message without writing a second file. Reusing an ID for changed content returns 409. Legacy clients that omit this field keep the original send behavior. Fault controls are available for development and demonstration.

## Persistence

`src/store.ts` stores JSON records in SQLite. `CHAT_DB` sets the database path; the default is `.data/chat-v2.sqlite`. `PORT` sets the HTTP port; the default is 4310. New image/video objects are stored beside the database in `objects/nearby-media/` (default `.data/objects/nearby-media/`), through the local S3 adapter with random server-generated keys. SQLite stores metadata and the stable `s3://nearby-media/<key>` reference; this is simulated storage, not an AWS upload. Legacy images remain in `uploads/` and continue to work. Neither directory is publicly served. Temporary uploads go into `.upload-tmp/`, and normal send errors, validation errors, interrupted uploads and duplicate retries clean them up. Reset removes attachment records and their files as well as messages and send IDs. Keep local data out of Git.

## Playback links and video seeking

`GET /api/attachments/:id/link` requires `X-Actor-Id` and membership, then returns a local HMAC-signed URL. Links expire after 15 minutes by default (`MEDIA_LINK_TTL_SECONDS`, 1–3600). The signing secret persists in SQLite across restart and reset. Expiring URLs are generated on read, not stored as permanent database values. The stable `link` field points to the authenticated attachment endpoint; `storage.uri` records the object reference.

Signed URLs are bearer links: possession allows access until expiry, subject to the original actor still being a member of that conversation. Clients should keep them private. Playback does not require a custom identity header on the video element. Invalid or expired links return 403; removed attachments or revoked membership return 404. The player refreshes an expired link on a playback error, or provides a retry button. Standard single byte ranges return 206 with `Content-Range`; invalid ranges return 416. HEAD returns the same size/range headers without a body.

The UI uses keyed message elements, so polling or receiving another message does not recreate an existing video player. Attachment selection lives under the composer’s plus button; the selected card is above the text. Upload percentage reports browser-to-server transfer; after 100% the UI waits for the server’s message confirmation before clearing the draft.

## Scope and limits

One image or video per message, with optional text, preview/removal, upload progress, error states, original image viewer and native video controls. Both conversation participants can send media. Experts have no access until the conversation model explicitly grants it. Demo identity headers remain simulated authentication.

Original files are preserved; no compression, transcoding, annotation, multiple attachments or expert-sharing UI. Video duration is browser-reported display metadata, not a trusted authorization or validation input. New uploads and video reads stream to/from disk; image validation and legacy image hashing may buffer up to 15 MiB. A process crash can leave a temporary upload or an unreferenced object between filesystem and SQLite commits; automatic crash-orphan sweeping is not included. Unsent drafts survive a send error in the open page, not a page reload or identity switch.

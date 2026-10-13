# Nearby Chat

A product engineering exercise: choose **one of three scenarios**, define a useful scope, and build a working version with AI. Coding time is at most **30 minutes**.

Alex has a leaking kitchen sink. Jordan and Sam are plumbers. Nearby Support is the platform's customer service team.

## Start

Use **Node.js 24 or newer**. Install and check the environment before the coding timer starts.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4310**.

1. As **Customer**, send a text message to Nearby Support.
2. Switch to **Platform** to read and reply.
3. The **Professional** view switches between Jordan and Sam; they start without conversations.

The starter provides one empty customer–support conversation, text, image and video messaging, perspective switching and SQLite persistence. Use this as your starting point, and change the frontend and backend as needed.

## Choose your scenario

[Interview brief](https://nearby-messaging-interview.thrivingpanda.chatgpt.site/) · [English](TASKS.md) · [中文题面](TASKS.zh-CN.md)

Explain the user problem, ask questions, and choose your scope and interactions. Deliver one complete user flow, write your own checks, and explain your tradeoffs. You do not need to implement every possible feature.

Open a PR from your fork to `thuwyh/nearby-msg`. Include the selected scenario, your decisions, demo steps, verification and remaining gaps.

```sh
npm run typecheck
```

## Optional material

[sample-assets/leaking-sink.png](sample-assets/leaking-sink.png) is an AI-generated example photo (PNG, 1.87 MiB), available if it helps your chosen approach.

## Code map

| File | Purpose |
| --- | --- |
| `src/server.ts` | HTTP routes, static files and one-shot connection faults |
| `src/chat.ts` | Membership checks and text messaging |
| `src/store.ts` | SQLite records, four demo people, initial conversation |
| `src/types.ts` | Shared data types |
| `tools/workbench/` | Plain HTML/CSS/JavaScript interface |

[Starter API reference](CONTRACT.md) describes the code that is already provided. You can extend or change it; document changes needed to run or verify your submission.

## Local state

- Data is stored in `.data/chat-v2.sqlite` (ignored by Git). Refresh and server restart preserve it.
- **Reset demo** clears the chat database after confirmation.
- Simulation controls can fail the next send before saving or after saving but before confirmation. They affect only the current identity.
- `PORT` changes the HTTP port; `CHAT_DB` changes the database path.
- The identity switcher simulates people locally. Real sign-in, external accounts and production messaging are outside this exercise. The backend still checks conversation membership.

中文：从三个场景中任选一个，自行确定交互和实现范围，最多编码 30 分钟。先说明判断，再演示完整流程和验证结果。评估代码不在此仓库中，请自行编写检查。图片素材位于 `sample-assets/`，可按需使用。

## Describe the problem with photos and videos (S1)

The composer’s **＋** menu offers **Add image** and **Add video**. Attach one JPEG/PNG/WebP up to 15 MiB, or one browser-playable MP4/WebM up to 100 MiB. A removable preview appears above the text; a description is optional. Uploads show progress and clear only when the message is confirmed. Platform can open original photos or play, pause, seek and fullscreen videos.

New files live in `.data/objects/nearby-media/` through a local S3 storage adapter. SQLite saves metadata, object keys, simulated S3 references and stable authorized attachment links. Short-lived signed playback links are generated on read, never persisted as permanent URLs. Existing photos in `.data/uploads/`, text messages and database records continue to work without reset or migration. No AWS account, credentials or cloud setup are needed.

Demo:
1. Refresh http://127.0.0.1:4310. As Customer, click **＋ → Add image**, choose `sample-assets/leaking-sink.png`, describe where/when it leaks, and send.
2. Choose **＋ → Add video**, select a short MP4/WebM (small playable fixtures are in `tests/fixtures/`), preview it, add text, and send.
3. Switch to Platform. Open the photo and play/seek the video, then reply with text. Switch back to Customer.
4. Apply **Save, then lose confirmation** under simulation controls and send media. The draft remains unconfirmed; retrying unchanged content returns the saved message without duplicating the file.
5. Refresh or restart and verify the attachments remain available. Professionals have no conversations and cannot obtain media links.

Verification:
```sh
npm run typecheck
npm test
```
Tests use temporary databases without resetting your current chat. They cover a PNG over 10 MiB; a streamed 100 MiB MP4; MP4/WebM messages; legacy photos and retries across the upgrade; metadata and stored bytes; signed GET/HEAD, byte-range seeking, invalid/expired/tampered links and revoked access; both fault modes; concurrent and post-restart retries; oversized, malformed and disconnected uploads; reset and failed-database-write cleanup.

Scope: one original attachment per message; no compression, video transcoding, multiple attachments, annotation, or expert-sharing interface. Codec compatibility depends on the browser. See `CONTRACT.md` for API details, signed-link behavior and local-storage limitations.

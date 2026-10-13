const $ = (id) => document.getElementById(id);
const dictionary = {
  addMedia: ["Add attachment", "添加附件"],
  addVideo: ["Add video", "添加视频"],
  removeMedia: ["Remove attachment", "移除附件"],
  videoTooLarge: ["Videos must be 100 MiB or smaller.", "视频不能超过 100 MiB。"],
  videoInvalid: ["Choose an MP4 or WebM video that this browser can play.", "请选择此浏览器可播放的 MP4 或 WebM 视频。"],
  mediaLoading: ["Loading video…", "正在加载视频…"],
  videoRetry: ["Cannot play video. Refresh playback link.", "视频暂时无法播放，点击刷新播放链接。"],
  mediaChecking: ["Checking attachment…", "正在检查附件…"],
  uploading: ["Uploading", "正在上传"],
  saving: ["Upload complete. Confirming message…", "上传完成，正在确认消息…"],
  addImage: ["Add image", "添加图片"],
  removeImage: ["Remove image", "移除图片"],
  closeImage: ["Close image", "关闭图片"],
  viewImage: ["View original image", "查看原图"],
  describeHint: ["Describe where it leaks, when it started, and whether it is continuous. Photos up to 15 MiB; MP4 or WebM videos up to 100 MiB.", "可以描述哪里漏水、何时开始、是否持续漏水。图片最大 15 MiB，MP4 或 WebM 视频最大 100 MiB。"],
  imageInvalid: ["Choose a valid JPEG, PNG or WebP image.", "请选择有效的 JPEG、PNG 或 WebP 图片。"],
  imageTooLarge: ["Images must be 15 MiB or smaller.", "图片不能超过 15 MiB。"],
  imageLoading: ["Loading image…", "正在加载图片…"],
  imageChecking: ["Checking image…", "正在检查图片…"],
  imageFailed: ["Image unavailable. Click to retry.", "图片加载失败，点击重试。"],
  sendingImage: ["Sending image…", "正在发送图片…"],
  messages: ["messages", "消息"],
  local: ["Local demo", "本地模拟"],
  viewAs: ["VIEW AS", "切换视角"],
  customer: ["Customer", "用户"],
  professional: ["Professional", "师傅"],
  platform: ["Platform", "平台"],
  guide: ["Quick guide", "操作指南"],
  story: [
    "Alex needs help with a leaking kitchen sink. Jordan and Sam are plumbers on Nearby; Nearby Support is the platform’s customer service team.",
    "Alex 家的厨房水槽漏水，需要找师傅维修。Jordan 和 Sam 是平台上的水管工，Nearby 客服代表平台。",
  ],
  step1: [
    "As Customer, send a text message to Nearby Support below.",
    "在「用户」视角，向下方的 Nearby 客服发送一条文字消息。",
  ],
  step2: [
    "Switch to Platform to read it and reply. Switch back to Customer to see the reply.",
    "切换到「平台」阅读并回复，再切回「用户」查看回复。",
  ],
  step3: [
    "The Professional view switches between Jordan and Sam. They have no conversations yet.",
    "「师傅」视角可以切换 Jordan 和 Sam。他们目前还没有对话。",
  ],
  guideNote: [
    "All views share one local server. Messages survive refresh and restart. No real accounts or external messages.",
    "三个视角共用本地数据，刷新或重启后消息仍然保留。不会向外部发送消息，也不需要真实账号。",
  ],
  conversations: ["Conversations", "对话"],
  people: ["People in this demo", "模拟器中的人物"],
  write: ["Write a message", "输入消息"],
  textOnly: [
    "Enter to send · Shift + Enter for a new line",
    "Enter 发送 · Shift + Enter 换行",
  ],
  send: ["Send message", "发送消息"],
  simulation: ["Simulation controls", "模拟工具"],
  nextSend: ["Next send from this identity", "当前身份的下一次发送"],
  normal: ["Normal connection", "正常连接"],
  before: ["Fail before saving", "保存前连接失败"],
  after: ["Save, then lose confirmation", "保存成功，但确认响应丢失"],
  apply: ["Apply once", "应用一次"],
  faultNote: [
    "A connection can fail before a message arrives, or after it is saved but before the sender gets confirmation. This affects only the next send from the current identity.",
    "连接可能在消息到达前失败，也可能在保存成功后、发送者收到确认前中断。这里只影响当前身份的下一次发送。",
  ],
  reset: ["Reset demo", "重置模拟器"],
  resetTitle: ["Start a fresh demo?", "重新开始？"],
  resetDescription: [
    "This deletes all chat messages and attachments and restores the single empty conversation with Nearby Support.",
    "这会删除所有聊天消息和附件，恢复为一个与 Nearby 客服的空对话。",
  ],
  cancel: ["Cancel", "取消"],
  support: ["Nearby Support", "Nearby 客服"],
  connected: ["Connected", "已连接"],
  offline: ["Cannot reach server", "连接服务器失败"],
  emptyTitle: ["Start the conversation", "开始对话"],
  emptyBody: [
    "Send your first message below. Switch perspectives to read and reply as the other person.",
    "在下方发送第一条消息，再切换视角，作为对方阅读和回复。",
  ],
  noConversation: ["No conversations yet", "暂无对话"],
  noConversationBody: [
    "This professional has not started a conversation with Alex.",
    "这位师傅尚未与 Alex 建立对话。",
  ],
  customerDescription: [
    "Needs help with a leaking kitchen sink",
    "需要维修漏水的厨房水槽",
  ],
  supportDescription: ["Platform customer service", "平台客服"],
  pro1Description: ["Plumber · available today", "水管工 · 今天有空"],
  pro2Description: ["Plumber · available tomorrow", "水管工 · 明天有空"],
  customerThread: ["Your conversation with the platform", "你与平台客服的对话"],
  supportThread: [
    "Help Alex with their service request",
    "协助 Alex 处理维修需求",
  ],
  emptyList: ["No active conversations", "还没有进行中的对话"],
  open: ["Open conversation", "打开对话"],
  sending: ["Sending…", "发送中…"],
  applied: ["Applied to the next send.", "已应用到下一次发送。"],
  sendFailure: [
    "Message not confirmed. Your draft and attachment are kept below. Retry unchanged content to avoid a duplicate.",
    "未确认发送成功，文字和附件已保留。可以直接重试同一条消息，避免重复发送。",
  ],
};
const MAX_IMAGE_BYTES = 15 * 1024 * 1024, MAX_VIDEO_BYTES = 100 * 1024 * 1024;
let selectedMedia = null, selectedDuration = null, previewUrl = null, mediaSelection = 0, pendingSend = null, selectingMedia = false;
const videoLinks = new Map();
const imageUrls = new Map(), imageLoads = new Map();
let language = localStorage.getItem("nearby-chat-language") || "en";
let actor = "customer",
  professional = "pro-1",
  state = null,
  conversationId = null,
  revision = 0,
  busy = false,
  polling = false,
  lastMessages = "";
const t = (key) => dictionary[key]?.[language === "zh-CN" ? 1 : 0] || key;
const name = (p) => (p?.id === "support" ? t("support") : p?.name || "");
const description = (p) =>
  t(
    p.id === "customer"
      ? "customerDescription"
      : p.id === "support"
        ? "supportDescription"
        : p.id === "pro-1"
          ? "pro1Description"
          : "pro2Description",
  );
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const initials = (p) => (p.id === "support" ? "N" : p.name[0]);
async function api(path, body, identity = actor) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), "X-Actor-Id": identity },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function localize() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-t]").forEach((el) => {
    el.textContent = t(el.dataset.t);
  });
  $("language").textContent = language === "en" ? "中文" : "EN";
  $("message-input").placeholder =
    language === "en" ? "Write a message…" : "输入消息…";
  $("add-media").setAttribute("aria-label", t("addMedia"));
  $("preview-image").alt = t("viewImage");
  $("full-image").alt = t("viewImage");
  if (busy) $("send").textContent = t("sending");
  else if (selectingMedia) $("send").textContent = t("mediaChecking");
  if (state) renderState();
  lastMessages = "";
  refresh();
}
function renderState() {
  const me = state.person;
  $("identity-avatar").textContent = initials(me);
  $("identity-name").textContent = name(me);
  $("identity-description").textContent = description(me);
  $("professional-select").hidden = me.role !== "professional";
  document
    .querySelectorAll("[data-role]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.role === me.role)),
    );
  $("conversation-count").textContent = state.conversations.length;
  $("conversation-list").innerHTML = state.conversations.length
    ? state.conversations
        .map((c) => {
          const other = state.people.find(
            (p) => c.participantIds.includes(p.id) && p.id !== actor,
          );
          return `<button class="conversation ${c.id === conversationId ? "selected" : ""}" data-conversation="${esc(c.id)}" aria-pressed="${c.id === conversationId}"><span class="avatar">${esc(initials(other))}</span><span><strong>${esc(name(other))}</strong><small>${esc(t("open"))}</small></span></button>`;
        })
        .join("")
    : `<p class="empty">${esc(t("emptyList"))}</p>`;
  $("people-list").innerHTML = state.people
    .filter((p) => p.id !== actor)
    .map(
      (p) =>
        `<div class="person"><span class="avatar">${esc(initials(p))}</span><div><strong>${esc(name(p))}</strong><small>${esc(description(p))}</small></div></div>`,
    )
    .join("");
  const selected = state.conversations.find((c) => c.id === conversationId);
  const other =
    selected &&
    state.people.find(
      (p) => selected.participantIds.includes(p.id) && p.id !== actor,
    );
  $("chat-title").textContent = other ? name(other) : t("noConversation");
  $("chat-subtitle").textContent = selected
    ? t(actor === "support" ? "supportThread" : "customerThread")
    : t("noConversationBody");
  $("composer").hidden = !selected;
  if (!selected)
    $("message-list").innerHTML =
      `<div class="empty"><div class="empty-symbol" aria-hidden="true">…</div><strong>${esc(t("noConversation"))}</strong>${esc(t("noConversationBody"))}</div>`;
}
function renderMessages(messages) {
  const signature = JSON.stringify(messages) + language + actor;
  if (signature === lastMessages) return;
  lastMessages = signature;
  const list = $("message-list"),
    wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  if (!messages.length) {
    list.innerHTML = `<div class="empty"><div class="empty-symbol" aria-hidden="true">…</div><strong>${esc(t("emptyTitle"))}</strong>${esc(t("emptyBody"))}</div>`;
    list.scrollTop = 0;
    return;
  }
  const existing = new Map([...list.querySelectorAll("[data-message-id]")].map((el) => [el.dataset.messageId, el]));
  list.querySelectorAll(".empty").forEach((el) => el.remove());
  const ids = new Set(messages.map((m) => m.id));
  existing.forEach((el, id) => { if (!ids.has(id)) el.remove(); });
  messages.forEach((m, index) => {
    const itemSignature = JSON.stringify(m) + language + actor;
    let item = existing.get(m.id);
    if (!item || item.dataset.signature !== itemSignature) {
      const sender = state.people.find((p) => p.id === m.senderId);
      const media = !m.attachment ? "" : m.attachment.mimeType.startsWith("video/")
        ? `<div class="video-attachment" data-video="${esc(m.attachment.id)}"><video controls playsinline preload="metadata" aria-label="${esc(m.attachment.filename || t("addVideo"))}"></video><span class="media-status">${esc(t("mediaLoading"))}</span><button class="retry-video" type="button" hidden>${esc(t("videoRetry"))}</button></div>`
        : `<button type="button" class="image-attachment" data-image="${esc(m.attachment.id)}" aria-label="${esc(t("viewImage"))}"><img alt="${esc(t("viewImage"))}" hidden /><span class="image-status">${esc(t("imageLoading"))}</span></button>`;
      const replacement = document.createElement("article");
      replacement.className = `message ${m.senderId === actor ? "mine" : ""}`;
      replacement.dataset.messageId = m.id;
      replacement.dataset.signature = itemSignature;
      replacement.innerHTML = `${media}${m.text ? `<div class="bubble">${esc(m.text)}</div>` : ""}<div class="meta">${esc(name(sender))} · ${esc(new Date(m.createdAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }))}</div>`;
      if (item) item.replaceWith(replacement);
      item = replacement;
    }
    // Keep existing players in place when a new message arrives or polling runs.
    if (list.children[index] !== item) list.insertBefore(item, list.children[index] || null);
  });
  list.querySelectorAll("[data-image]").forEach((button) => loadMessageImage(button));
  list.querySelectorAll("[data-video]:not([data-loaded])").forEach((container) => loadMessageVideo(container));
  if (wasNearBottom || messages.at(-1)?.senderId === actor) list.scrollTop = list.scrollHeight;
}
async function refresh() {
  if (polling) return;
  polling = true;
  const version = revision,
    identity = actor;
  try {
    const next = await api("/api/state", undefined, identity);
    if (version !== revision) return;
    const changed = JSON.stringify(state) !== JSON.stringify(next);
    state = next;
    if (!state.conversations.some((c) => c.id === conversationId)) {
      conversationId = state.conversations[0]?.id || null;
      lastMessages = "";
    }
    if (changed) renderState();
    if (conversationId) {
      const selected = conversationId;
      const result = await api(
        `/api/conversations/${encodeURIComponent(selected)}/messages`,
        undefined,
        identity,
      );
      if (version !== revision || selected !== conversationId) return;
      renderMessages(result.messages);
    }
    $("connection").textContent = t("connected");
  } catch {
    if (version === revision) $("connection").textContent = t("offline");
  } finally {
    polling = false;
  }
}
function closeAttachmentMenu() {
  $("attachment-menu").hidden = true;
  $("add-media").setAttribute("aria-expanded", "false");
}
function clearMedia() {
  mediaSelection++;
  selectingMedia = false;
  $("send").disabled = busy;
  if (!busy) $("send").textContent = t("send");
  selectedMedia = null;
  selectedDuration = null;
  $("preview-video").pause();
  $("preview-video").removeAttribute("src");
  $("preview-video").load();
  $("preview-video").hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $("preview-image").removeAttribute("src");
  $("preview-image").hidden = true;
  $("media-preview").hidden = true;
  $("image-input").value = "";
  $("video-input").value = "";
  closeAttachmentMenu();
}
function clearMessageImages() {
  $("message-list").querySelectorAll("video").forEach((video) => {
    video.onerror = null;
    video.pause(); video.removeAttribute("src"); video.load();
  });
  videoLinks.clear();
  imageUrls.forEach((url) => URL.revokeObjectURL(url));
  imageUrls.clear();
  imageLoads.clear();
  if ($("image-dialog").open) $("image-dialog").close();
  $("full-image").removeAttribute("src");
}
async function loadMessageVideo(container, renew = false) {
  const id = container.dataset.video, version = revision, identity = actor;
  if (container.dataset.loading) return;
  container.dataset.loading = "true";
  const video = container.querySelector("video"), status = container.querySelector(".media-status"),
    retry = container.querySelector(".retry-video");
  const position = Number(container.dataset.position || 0), resume = container.dataset.playing === "true";
  retry.hidden = true;
  status.hidden = false;
  status.textContent = t("mediaLoading");
  retry.onclick = () => loadMessageVideo(container, true);
  try {
    let link = videoLinks.get(id);
    if (renew || !link || Date.parse(link.expiresAt) <= Date.now() + 30000) {
      link = await api(`/api/attachments/${encodeURIComponent(id)}/link`, undefined, identity);
      if (revision !== version || !container.isConnected) return;
      videoLinks.set(id, link);
    }
    video.onloadedmetadata = () => {
      status.hidden = true;
      if (position > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position, video.duration);
      if (resume) video.play().catch(() => {});
    };
    video.ontimeupdate = () => { container.dataset.position = String(video.currentTime); };
    video.onplay = () => { container.dataset.playing = "true"; };
    video.onpause = () => { if (!video.error) container.dataset.playing = "false"; };
    video.onerror = () => {
      if (revision !== version || !container.isConnected) return;
      const current = videoLinks.get(id);
      if (current && Date.parse(current.expiresAt) <= Date.now()) loadMessageVideo(container, true);
      else { status.hidden = true; retry.hidden = false; }
    };
    video.src = link.url;
    container.dataset.loaded = "true";
  } catch {
    if (revision === version && container.isConnected) { status.hidden = true; retry.hidden = false; }
  } finally { delete container.dataset.loading; }
}
async function loadMessageImage(button) {
  const id = button.dataset.image, version = revision, identity = actor;
  try {
    let url = imageUrls.get(id);
    if (!url) {
      let loading = imageLoads.get(id);
      if (!loading) {
        loading = (async () => {
          const response = await fetch(`/api/attachments/${encodeURIComponent(id)}`, {
            headers: { "X-Actor-Id": identity },
          });
          if (!response.ok) throw new Error("Image unavailable");
          const blob = await response.blob();
          if (revision !== version) return null;
          const result = URL.createObjectURL(blob);
          imageUrls.set(id, result);
          return result;
        })();
        imageLoads.set(id, loading);
      }
      try { url = await loading; }
      finally { if (imageLoads.get(id) === loading) imageLoads.delete(id); }
    }
    if (!url || revision !== version || !button.isConnected) return;
    const img = button.querySelector("img");
    img.src = url;
    img.hidden = false;
    button.querySelector(".image-status").hidden = true;
    return url;
  } catch {
    if (revision === version && button.isConnected) {
      button.querySelector(".image-status").textContent = t("imageFailed");
      button.querySelector(".image-status").hidden = false;
    }
  }
}
$("message-list").onclick = async (event) => {
  const button = event.target.closest("[data-image]");
  if (!button) return;
  const url = await loadMessageImage(button);
  if (url && button.isConnected) {
    $("full-image").src = url;
    $("image-dialog").showModal();
  }
};
$("close-image").onclick = () => $("image-dialog").close();
$("add-media").onclick = () => {
  const opening = $("attachment-menu").hidden;
  $("attachment-menu").hidden = !opening;
  $("add-media").setAttribute("aria-expanded", String(opening));
  if (opening) $("choose-image").focus();
};
$("choose-image").onclick = () => { closeAttachmentMenu(); $("image-input").click(); };
$("choose-video").onclick = () => { closeAttachmentMenu(); $("video-input").click(); };
document.addEventListener("click", (event) => { if (!event.target.closest(".attachment-picker")) closeAttachmentMenu(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("attachment-menu").hidden) { closeAttachmentMenu(); $("add-media").focus(); }
});
$("remove-media").onclick = () => { clearMedia(); pendingSend = null; };
async function chooseMedia(event) {
  const file = event.target.files[0];
  if (!file) return;
  const token = ++mediaSelection, videoFile = file.type.startsWith("video/");
  $("send-error").hidden = true;
  const fail = (key) => {
    $("send-error").textContent = t(key);
    $("send-error").hidden = false;
    event.target.value = "";
  };
  if (file.size > (videoFile ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) return fail(videoFile ? "videoTooLarge" : "imageTooLarge");
  if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(file.type)) return fail(videoFile ? "videoInvalid" : "imageInvalid");
  selectingMedia = true;
  $("send").disabled = true;
  $("send").textContent = t("mediaChecking");
  const url = URL.createObjectURL(file);
  let checker = null, duration = null;
  try {
    if (videoFile) {
      checker = document.createElement("video");
      checker.preload = "auto"; checker.muted = true;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Video cannot be decoded")), 15000);
        checker.onloadeddata = () => { clearTimeout(timer); resolve(); };
        checker.onerror = () => { clearTimeout(timer); reject(new Error("Invalid video")); };
        checker.src = url;
      });
      duration = checker.duration;
      if (!Number.isFinite(duration) || duration <= 0 || duration > 86400) throw new Error("Invalid duration");
    } else {
      const preview = new Image(); preview.src = url; await preview.decode();
    }
    if (token !== mediaSelection) { URL.revokeObjectURL(url); return; }
    clearMedia();
    selectedMedia = file;
    selectedDuration = duration;
    previewUrl = url;
    pendingSend = null;
    if (videoFile) { $("preview-video").src = url; $("preview-video").hidden = false; }
    else { $("preview-image").src = url; $("preview-image").hidden = false; }
    const time = duration === null ? "" : ` · ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`;
    const size = file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KiB` : `${(file.size / 1024 / 1024).toFixed(1)} MiB`;
    $("media-details").textContent = `${file.name} · ${size}${time}`;
    $("media-preview").hidden = false;
  } catch {
    URL.revokeObjectURL(url);
    if (token === mediaSelection) fail(videoFile ? "videoInvalid" : "imageInvalid");
  } finally {
    if (checker) { checker.onloadeddata = null; checker.onerror = null; checker.removeAttribute("src"); checker.load(); }
    if (token === mediaSelection) {
      selectingMedia = false;
      $("send").disabled = busy;
      if (!busy) $("send").textContent = t("send");
    }
  }
}
$("image-input").onchange = chooseMedia;
$("video-input").onchange = chooseMedia;
function uploadMessage(path, form, identity, version) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.setRequestHeader("X-Actor-Id", identity);
    xhr.timeout = 20 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (revision !== version) return;
      const percent = event.lengthComputable ? Math.round(event.loaded / event.total * 100) : 0;
      $("upload-progress").value = percent;
      $("upload-label").textContent = percent >= 100 ? t("saving") : `${t("uploading")} ${percent}%`;
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) reject(new Error(data.error || "Upload failed"));
        else resolve(data);
      } catch { reject(new Error("Upload was not confirmed")); }
    };
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error("Upload interrupted or not confirmed"));
    xhr.send(form);
  });
}
function switchActor(id) {
  clearMedia();
  clearMessageImages();
  pendingSend = null;
  $("upload-status").hidden = true;
  actor = id;
  revision++;
  state = null;
  conversationId = null;
  lastMessages = "";
  $("message-input").value = "";
  $("send-error").hidden = true;
  $("fault-status").textContent = "";
  $("message-list").replaceChildren();
  $("conversation-list").replaceChildren();
  $("composer").hidden = true;
  refresh();
}
document
  .querySelectorAll("[data-role]")
  .forEach(
    (b) =>
      (b.onclick = () =>
        switchActor(
          b.dataset.role === "professional" ? professional : b.dataset.role,
        )),
  );
$("professional-select").onchange = (e) => {
  professional = e.target.value;
  switchActor(professional);
};
$("conversation-list").onclick = (e) => {
  const button = e.target.closest("[data-conversation]");
  if (!button) return;
  clearMedia();
  clearMessageImages();
  pendingSend = null;
  conversationId = button.dataset.conversation;
  revision++;
  lastMessages = "";
  $("message-input").value = "";
  $("send-error").hidden = true;
  renderState();
  refresh();
};
$("language").onclick = () => {
  language = language === "en" ? "zh-CN" : "en";
  localStorage.setItem("nearby-chat-language", language);
  localize();
};
$("composer").onsubmit = async (e) => {
  e.preventDefault();
  if (busy || selectingMedia || !conversationId || (!$("message-input").value.trim() && !selectedMedia)) return;
  busy = true;
  const version = revision, identity = actor, selected = conversationId,
    text = $("message-input").value, file = selectedMedia;
  if (!pendingSend || pendingSend.text !== text || pendingSend.file !== file ||
      pendingSend.identity !== identity || pendingSend.conversation !== selected) {
    pendingSend = { text, file, identity, conversation: selected, clientMessageId: crypto.randomUUID() };
  }
  const request = pendingSend;
  ["send", "add-media", "remove-media", "choose-image", "choose-video", "image-input", "video-input"].forEach((id) => $(id).disabled = true);
  closeAttachmentMenu();
  $("preview-video").pause();
  $("send").textContent = t("sending");
  $("upload-status").hidden = !file;
  $("upload-progress").value = 0;
  $("upload-label").textContent = `${t("uploading")} 0%`;
  $("send-error").hidden = true;
  try {
    let body = { text, clientMessageId: request.clientMessageId };
    if (file) {
      body = new FormData();
      body.append("text", text);
      body.append("clientMessageId", request.clientMessageId);
      body.append("media", file);
      if (selectedDuration !== null) body.append("durationSeconds", String(selectedDuration));
    }
    const path = `/api/conversations/${encodeURIComponent(selected)}/messages`;
    if (file) await uploadMessage(path, body, identity, version);
    else await api(path, body, identity);
    if (version === revision) {
      if ($("message-input").value === text) $("message-input").value = "";
      if (selectedMedia === file) clearMedia();
      if (pendingSend === request) pendingSend = null;
    }
  } catch (error) {
    if (version === revision) {
      $("send-error").textContent = t("sendFailure") + " " + error.message;
      $("send-error").hidden = false;
    }
  } finally {
    busy = false;
    ["send", "add-media", "remove-media", "choose-image", "choose-video", "image-input", "video-input"].forEach((id) => $(id).disabled = false);
    $("send").textContent = t("send");
    if (version === revision) {
      $("upload-status").hidden = true;
      $("fault-status").textContent = "";
      $("fault").value = "none";
    }
    refresh();
  }
};
$("message-input").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
};
$("arm").onclick = async () => {
  try {
    await api("/api/dev/fault", { mode: $("fault").value });
    $("fault-status").textContent = t("applied");
  } catch (e) {
    $("fault-status").textContent = e.message;
  }
};
$("reset").onclick = () => $("reset-dialog").showModal();
$("cancel-reset").onclick = () => $("reset-dialog").close();
$("confirm-reset").onclick = async () => {
  try {
    await api("/api/dev/reset", {});
    $("reset-dialog").close();
    switchActor("customer");
  } catch (e) {
    $("connection").textContent = e.message;
  }
};
localize();
setInterval(refresh, 1000);

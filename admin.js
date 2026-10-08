/* =========================================================
   管理頁程式 —— 一般情況不需要修改
   直接用 Supabase 的網路 API（不需要額外套件）：
   ・登入／建立帳號
   ・讀取、新增、修改、刪除旅程
   ・上傳照片到雲端儲存空間
   ========================================================= */

const API = SUPABASE.url;
const BUCKET = "photos";
const $ = id => document.getElementById(id);

// ---------- 提示訊息 ----------
function toast(msg, isError = false) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), isError ? 5000 : 2600);
}

// 把 Supabase 回傳的英文錯誤翻成比較好懂的中文
function friendlyError(err) {
  const m = String(err?.message || err);
  if (/Invalid login credentials/i.test(m)) return "Email 或密碼不正確";
  if (/Email not confirmed/i.test(m)) return "這個帳號還沒確認，請先到信箱點確認連結";
  if (/User already registered/i.test(m)) return "這個 Email 已經建立過帳號了，請直接登入";
  if (/Password should be at least/i.test(m)) return "密碼至少要 6 個字";
  if (/rate limit|too many/i.test(m)) return "嘗試太多次了，請稍等幾分鐘再試";
  if (/row-level security|permission|403/i.test(m)) return "這個帳號沒有修改權限";
  if (/Failed to fetch|NetworkError/i.test(m)) return "連不上網路，請檢查連線";
  return m;
}

// ---------- 登入狀態（存在這台電腦的瀏覽器裡） ----------
const SESSION_KEY = "travelmap-admin-session";
let session = null;
function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* 無痕模式等情況存不了，沒關係 */ }
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}
function sessionFrom(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    email: data.user?.email
  };
}

async function authRequest(path, body) {
  const res = await fetch(`${API}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE.key, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || data.error || `HTTP ${res.status}`);
  return data;
}

// 取得有效的登入憑證（快過期就自動更新）
async function token() {
  if (!session) throw new Error("請先登入");
  if (Date.now() > session.expires_at - 60_000) {
    try {
      const data = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      saveSession(sessionFrom(data));
    } catch (err) {
      saveSession(null);
      showLogin("登入已過期，請重新登入");
      throw err;
    }
  }
  return session.access_token;
}

// ---------- 資料庫 API ----------
async function db(method, query, body) {
  const headers = { apikey: SUPABASE.key, "Content-Type": "application/json", Prefer: "return=representation" };
  if (session) headers.Authorization = "Bearer " + (await token());
  const res = await fetch(`${API}/rest/v1/${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

async function uploadPhoto(path, blob) {
  const res = await fetch(`${API}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE.key, Authorization: "Bearer " + (await token()), "Content-Type": blob.type, "x-upsert": "false" },
    body: blob
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return `${API}/storage/v1/object/public/${BUCKET}/${path}`;
}

// 刪掉雲端上不再使用的照片（失敗也沒關係，不影響旅程資料）
async function removePhotos(urls) {
  const prefix = `${API}/storage/v1/object/public/${BUCKET}/`;
  const paths = urls.filter(u => u && u.startsWith(prefix)).map(u => decodeURIComponent(u.slice(prefix.length)));
  if (!paths.length) return;
  try {
    await fetch(`${API}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE.key, Authorization: "Bearer " + (await token()), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths })
    });
  } catch (e) { console.warn("刪除舊照片失敗", e); }
}

// ---------- 畫面切換 ----------
function showLogin(msg = "") {
  $("login-view").hidden = false;
  $("app-view").hidden = true;
  $("logout").hidden = true;
  $("who").textContent = "";
  setMsg(msg, !!msg);
}
function setMsg(msg, isError = false) {
  const el = $("login-msg");
  el.textContent = msg;
  el.className = "msg " + (msg ? (isError ? "error" : "ok") : "");
}

async function enterApp() {
  // 確認這個帳號是不是管理員
  const rows = await db("GET", "admins?select=email");
  if (!rows?.length) {
    saveSession(null);
    showLogin(`「${session?.email || "這個帳號"}」沒有管理權限。`);
    return;
  }
  $("login-view").hidden = true;
  $("app-view").hidden = false;
  $("logout").hidden = false;
  $("who").textContent = session.email;
  initMap();
  await refreshList();
  if (trips.length) selectTrip(trips[0].id); else newTrip();
}

$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  setMsg("登入中…");
  try {
    const data = await authRequest("token?grant_type=password", {
      email: $("login-email").value.trim(),
      password: $("login-password").value
    });
    saveSession(sessionFrom(data));
    setMsg("");
    await enterApp();
  } catch (err) {
    setMsg(friendlyError(err), true);
  } finally {
    btn.disabled = false;
  }
});

$("signup").addEventListener("click", async () => {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || password.length < 6) {
    setMsg("請先在上面填好 Email 和密碼（至少 6 個字）", true);
    return;
  }
  try {
    const data = await authRequest("signup", { email, password });
    if (data.access_token) {
      saveSession(sessionFrom(data));
      await enterApp();
    } else {
      setMsg("✅ 帳號已建立！請到信箱收確認信，點信裡的連結後，再回來這裡登入。");
    }
  } catch (err) {
    setMsg(friendlyError(err), true);
  }
});

$("logout").addEventListener("click", async () => {
  if (dirty && !confirm("還有修改沒有儲存，確定要登出嗎？")) return;
  try {
    await fetch(`${API}/auth/v1/logout`, { method: "POST", headers: { apikey: SUPABASE.key, Authorization: "Bearer " + session.access_token } });
  } catch (e) { /* 沒關係 */ }
  saveSession(null);
  dirty = false;
  showLogin("已登出");
});

// ---------- 旅程清單 ----------
let trips = [];
let current = null;   // 正在編輯的旅程（資料庫的格式）
let isNew = false;
let photos = [];      // [{ src, caption }]
let originalPhotoUrls = [];
let dirty = false;

function setDirty(value) {
  dirty = value;
  $("dirty").hidden = !value;
}

async function refreshList() {
  trips = await db("GET", "trips?select=*&order=date.desc");
  renderList();
}

function renderList() {
  const ul = $("trip-list");
  if (!trips.length) {
    ul.innerHTML = '<li class="empty">還沒有旅程</li>';
    return;
  }
  ul.innerHTML = "";
  trips.forEach(t => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = t.id;
    btn.setAttribute("aria-current", current && !isNew && current.id === t.id ? "true" : "false");
    const img = document.createElement("img");
    img.src = t.cover || t.photos?.[0]?.src || "";
    img.alt = "";
    const text = document.createElement("span");
    text.innerHTML = "<strong></strong><small></small>";
    text.querySelector("strong").textContent = t.title;
    text.querySelector("small").textContent = `${t.place}・${t.date}`;
    btn.append(img, text);
    li.append(btn);
    ul.append(li);
  });
}

$("trip-list").addEventListener("click", e => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  if (dirty && !confirm("這趟旅程還有修改沒有儲存，要放棄修改嗎？")) return;
  selectTrip(btn.dataset.id);
});

$("new-trip").addEventListener("click", () => {
  if (dirty && !confirm("目前的修改還沒儲存，要放棄修改嗎？")) return;
  newTrip();
});

// ---------- 編輯表單 ----------
const form = $("trip-form");

function fillForm(t) {
  const [country = "", city = ""] = (t.place || "").split("・");
  form.title.value = t.title || "";
  form.country.value = country;
  form.city.value = city;
  form.date.value = t.date || "";
  form.endDate.value = t.end_date || "";
  form.lat.value = t.lat ?? "";
  form.lng.value = t.lng ?? "";
  form.story.value = t.story || "";
  photos = (t.photos || []).map(p => ({ ...p }));
  // 封面放在第一張
  if (t.cover) {
    const i = photos.findIndex(p => p.src === t.cover);
    if (i > 0) photos.unshift(photos.splice(i, 1)[0]);
  }
  originalPhotoUrls = photos.map(p => p.src);
  renderPhotos();
  form.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));
  updateMarker(true);
  setDirty(false);
}

function selectTrip(id) {
  current = trips.find(t => t.id === id);
  isNew = false;
  $("editor-title").textContent = "編輯旅程";
  $("delete").hidden = false;
  fillForm(current);
  renderList();
}

function newTrip() {
  isNew = true;
  current = { id: "trip-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) };
  $("editor-title").textContent = "新增旅程";
  $("delete").hidden = true;
  fillForm(current);
  renderList();
  form.title.focus();
}

form.addEventListener("input", e => {
  setDirty(true);
  e.target.classList?.remove("invalid"); // 改了就拿掉紅框
});

// 離開頁面前提醒還沒儲存
window.addEventListener("beforeunload", e => {
  if (dirty) { e.preventDefault(); e.returnValue = ""; }
});

// ---------- 地圖選位置 ----------
let map = null, marker = null;
function initMap() {
  if (map || !window.L) return;
  map = L.map("pick-map", { worldCopyJump: true, minZoom: 1, maxZoom: 12, attributionControl: false }).setView([25, 100], 2);
  if (typeof WORLD !== "undefined") {
    L.geoJSON(WORLD, { interactive: false, style: { color: "#b9a68a", weight: 0.7, fillColor: "#efe2c6", fillOpacity: 1 } }).addTo(map);
  }
  const icon = L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [13, 28] });
  marker = L.marker([0, 0], { icon, draggable: true });
  marker.on("dragend", () => setCoords(marker.getLatLng().lat, marker.getLatLng().lng, false));
  map.on("click", e => setCoords(e.latlng.lat, e.latlng.lng, false));
}

function setCoords(lat, lng, fly = true) {
  // 經度超出範圍時（地圖轉了好幾圈）換算回 -180～180
  lng = ((lng + 540) % 360) - 180;
  form.lat.value = lat.toFixed(4);
  form.lng.value = lng.toFixed(4);
  form.lat.classList.remove("invalid");
  form.lng.classList.remove("invalid");
  setDirty(true);
  updateMarker(fly);
}

function updateMarker(fly) {
  if (!map) return;
  const lat = parseFloat(form.lat.value), lng = parseFloat(form.lng.value);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    marker.setLatLng([lat, lng]).addTo(map);
    if (fly) map.setView([lat, lng], Math.max(map.getZoom(), 5));
  } else {
    marker.remove();
    if (fly) map.setView([25, 100], 2);
  }
  setTimeout(() => map.invalidateSize(), 50);
}

form.lat.addEventListener("change", () => updateMarker(true));
form.lng.addEventListener("change", () => updateMarker(true));

// 貼上 Google 地圖的座標（例如「25.0330, 121.5654」）
$("paste-coords").addEventListener("input", e => {
  const m = e.target.value.match(/(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    setCoords(lat, lng);
    e.target.value = "";
    toast("📍 已設定座標");
  }
});

// 用地名搜尋（OpenStreetMap 的免費搜尋服務）
async function searchPlace() {
  const q = $("place-search").value.trim();
  const box = $("search-results");
  if (!q) return;
  box.hidden = false;
  box.innerHTML = '<li class="hint">搜尋中…</li>';
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=zh-TW&q=${encodeURIComponent(q)}`;
    const results = await (await fetch(url)).json();
    if (!results.length) {
      box.innerHTML = '<li class="hint">找不到，換個寫法試試（中文、英文都可以）</li>';
      return;
    }
    box.innerHTML = "";
    results.forEach(r => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = r.display_name;
      btn.addEventListener("click", () => {
        setCoords(parseFloat(r.lat), parseFloat(r.lon));
        const a = r.address || {};
        if (!form.country.value && a.country) form.country.value = a.country;
        if (!form.city.value) form.city.value = a.city || a.town || a.village || a.county || a.state || "";
        form.country.classList.remove("invalid");
        box.hidden = true;
      });
      li.append(btn);
      box.append(li);
    });
  } catch (err) {
    box.innerHTML = '<li class="hint">搜尋服務暫時連不上，請改用點地圖或貼上座標</li>';
  }
}
$("place-search-btn").addEventListener("click", searchPlace);
$("place-search").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); searchPlace(); }
});

// ---------- 照片 ----------
function renderPhotos() {
  const ul = $("photos");
  ul.innerHTML = "";
  photos.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "photo" + (i === 0 ? " is-cover" : "") + (p.uploading ? " uploading" : "");
    li.innerHTML = `
      <img alt="">
      ${p.uploading ? '<span class="status">上傳中…</span>' : ""}
      <input class="caption" placeholder="照片說明" maxlength="80">
      <div class="row">
        <label class="cover"><input type="radio" name="cover" ${i === 0 ? "checked" : ""}> 封面</label>
        <button type="button" class="a-btn small" data-move="-1" aria-label="往前移" ${i === 0 ? "disabled" : ""}>←</button>
        <button type="button" class="a-btn small" data-move="1" aria-label="往後移" ${i === photos.length - 1 ? "disabled" : ""}>→</button>
        <button type="button" class="a-btn small danger" data-remove aria-label="刪除照片">✕</button>
      </div>`;
    li.querySelector("img").src = p.preview || p.src;
    const cap = li.querySelector(".caption");
    cap.value = p.caption || "";
    cap.addEventListener("input", () => { p.caption = cap.value; setDirty(true); });
    li.querySelector('[name="cover"]').addEventListener("change", () => {
      photos.unshift(photos.splice(i, 1)[0]);
      setDirty(true);
      renderPhotos();
    });
    li.querySelectorAll("[data-move]").forEach(btn => btn.addEventListener("click", () => {
      const j = i + Number(btn.dataset.move);
      [photos[i], photos[j]] = [photos[j], photos[i]];
      setDirty(true);
      renderPhotos();
    }));
    li.querySelector("[data-remove]").addEventListener("click", () => {
      photos.splice(i, 1);
      setDirty(true);
      renderPhotos();
    });
    ul.append(li);
  });
}

// 把照片縮小到最長邊 1600px、轉成 JPG，網頁才不會太慢
function resizeImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("無法轉換"))), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("讀不到這張照片")); };
    img.src = url;
  });
}

let uploadsInProgress = 0;
async function addFiles(files) {
  const list = [...files].filter(f => f.type.startsWith("image/"));
  if (!list.length) {
    toast("請選擇 JPG、PNG 或 WebP 照片（iPhone 的 HEIC 請先轉成 JPG）", true);
    return;
  }
  // 先把所有照片放上去（顯示「上傳中」），再一張一張上傳
  const items = list.map(file => ({ src: "", caption: "", uploading: true, preview: URL.createObjectURL(file), file }));
  photos.push(...items);
  uploadsInProgress += items.length;
  $("save").disabled = true;
  setDirty(true);
  renderPhotos();
  for (const item of items) {
    const file = item.file;
    delete item.file;
    try {
      const blob = await resizeImage(file);
      const path = `${current.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      item.src = await uploadPhoto(path, blob);
    } catch (err) {
      photos.splice(photos.indexOf(item), 1);
      toast(`「${file.name}」上傳失敗：${friendlyError(err)}`, true);
    } finally {
      item.uploading = false;
      URL.revokeObjectURL(item.preview);
      delete item.preview;
      uploadsInProgress--;
      $("save").disabled = uploadsInProgress > 0;
      renderPhotos();
    }
  }
}

$("photo-input").addEventListener("change", e => {
  addFiles(e.target.files);
  e.target.value = "";
});
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", e => { e.preventDefault(); addFiles(e.dataTransfer.files); });

// ---------- 儲存 ----------
function validate() {
  const errors = [];
  const mark = (el, bad) => el.classList.toggle("invalid", bad);
  mark(form.title, !form.title.value.trim()); if (!form.title.value.trim()) errors.push("標題");
  mark(form.country, !form.country.value.trim()); if (!form.country.value.trim()) errors.push("國家");
  mark(form.date, !form.date.value); if (!form.date.value) errors.push("出發日期");
  const lat = parseFloat(form.lat.value), lng = parseFloat(form.lng.value);
  const badPos = !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180;
  mark(form.lat, badPos); mark(form.lng, badPos);
  if (badPos) errors.push("地圖位置");
  if (form.endDate.value && form.date.value && form.endDate.value < form.date.value) {
    mark(form.endDate, true);
    errors.push("回程日期不能早於出發日期");
  } else mark(form.endDate, false);
  return errors;
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (uploadsInProgress) return toast("照片還在上傳，請稍等", true);
  const errors = validate();
  if (errors.length) return toast("請填寫：" + errors.join("、"), true);

  const country = form.country.value.trim(), city = form.city.value.trim();
  const row = {
    title: form.title.value.trim(),
    place: city ? `${country}・${city}` : country,
    lat: parseFloat(form.lat.value),
    lng: parseFloat(form.lng.value),
    date: form.date.value,
    end_date: form.endDate.value || null,
    cover: photos[0]?.src || null,
    photos: photos.map(p => ({ src: p.src, caption: p.caption || "" })),
    story: form.story.value.replace(/\r\n/g, "\n").trim()
  };

  const btn = $("save");
  btn.disabled = true;
  btn.textContent = "儲存中…";
  try {
    let saved;
    if (isNew) [saved] = await db("POST", "trips", { id: current.id, ...row });
    else [saved] = await db("PATCH", `trips?id=eq.${encodeURIComponent(current.id)}`, row);
    if (!saved) throw new Error("permission");
    // 從這趟旅程移除的照片，順便從雲端刪掉
    const kept = new Set(row.photos.map(p => p.src));
    removePhotos(originalPhotoUrls.filter(u => !kept.has(u)));
    setDirty(false);
    await refreshList();
    selectTrip(saved.id);
    toast("✅ 已儲存！重新整理網站就會看到");
  } catch (err) {
    toast("儲存失敗：" + friendlyError(err), true);
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 儲存";
  }
});

// ---------- 刪除 ----------
$("delete").addEventListener("click", async () => {
  if (isNew || !current) return;
  if (!confirm(`確定要刪除「${current.title}」嗎？\n照片也會一起刪除，刪了就救不回來。`)) return;
  try {
    const deleted = await db("DELETE", `trips?id=eq.${encodeURIComponent(current.id)}`);
    if (!deleted?.length) throw new Error("permission");
    removePhotos((current.photos || []).map(p => p.src));
    setDirty(false);
    toast("🗑 已刪除");
    await refreshList();
    if (trips.length) selectTrip(trips[0].id); else newTrip();
  } catch (err) {
    toast("刪除失敗：" + friendlyError(err), true);
  }
});

// ---------- 開始 ----------
(async function start() {
  if (typeof SUPABASE === "undefined") {
    showLogin("找不到 config.js 的資料庫設定");
    return;
  }
  session = loadSession();
  if (!session) return showLogin();
  try {
    await enterApp();
  } catch (err) {
    saveSession(null);
    showLogin("請重新登入");
  }
})();

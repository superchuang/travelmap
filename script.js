/* =========================================================
   網站程式 —— 一般情況不需要修改這個檔案
   旅程內容請改 data.js
   ========================================================= */

// 依出發日期排序（最新的在前面）
const trips = [...TRIPS].sort((a, b) => b.date.localeCompare(a.date));

// ---------- 小工具 ----------
function formatDate(d) {
  return d.replaceAll("-", ".");
}
function dateRange(trip) {
  return trip.endDate ? `${formatDate(trip.date)} – ${formatDate(trip.endDate)}` : formatDate(trip.date);
}
// 把文字裡的 < > 等符號轉成安全字元
function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// 每張卡片輪流使用的顏色（紙膠帶、護照章）
const COLORS = ["#e8735a", "#4fa3a5", "#e9a93a", "#d9718f", "#6c8ccf", "#7aa95c"];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const country = trip => trip.place.split("・")[0];
const year = trip => trip.date.slice(0, 4);

// ---------- 標題與統計 ----------
// 標題一個字一個字掉下來
document.getElementById("site-title").innerHTML = [...SITE.title]
  .map((ch, i) => `<span style="--i:${i}">${escapeHTML(ch)}</span>`).join("");
document.getElementById("site-subtitle").textContent = SITE.subtitle;
document.title = SITE.title;

const countries = new Set(trips.map(country));
const photoCount = trips.reduce((sum, t) => sum + t.photos.length, 0);
document.getElementById("stats").innerHTML = [
  [trips.length, "趟旅程", "✈"],
  [countries.size, "個國家／地區", "🌏"],
  [photoCount, "張照片", "📷"]
].map(([n, label, icon], i) => `
  <div class="ticket" style="--c:${COLORS[i + 1]}; --i:${i}">
    <span class="ticket-icon" aria-hidden="true">${icon}</span>
    <b data-count="${n}">${n}</b><span>${label}</span>
  </div>`).join("");

// 數字從 0 跳到實際數量
if (!reduceMotion) {
  document.querySelectorAll("[data-count]").forEach(el => {
    const target = Number(el.dataset.count);
    const start = performance.now() + 500;
    el.textContent = "0";
    (function tick(now) {
      const t = Math.min(1, Math.max(0, (now - start) / 1200));
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    })(performance.now());
  });
}

// 護照章的 HTML
function stampHTML(trip) {
  return `<small>${escapeHTML(country(trip))}</small><b>${year(trip)}</b><small>VISITED</small>`;
}

// ---------- 找出去過的國家（用來上色） ----------
// 判斷一個經緯度點是否落在某個國家的範圍內
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function containsPoint(feature, lng, lat) {
  return feature.geometry.coordinates.some(poly =>
    pointInRing(lng, lat, poly[0]) && !poly.slice(1).some(hole => pointInRing(lng, lat, hole)));
}
const visitedCountries = new Set();
if (typeof WORLD !== "undefined") {
  // 海邊的城市可能剛好落在海上，就往附近找一下
  const nearby = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  trips.forEach(t => {
    for (const [dx, dy] of nearby) {
      const hit = WORLD.features.find(f => containsPoint(f, t.lng + dx, t.lat + dy));
      if (hit) { visitedCountries.add(hit); break; }
    }
  });
}

// ---------- 平面地圖 ----------
// 第一次切換到平面地圖時才建立（Leaflet 需要看得見的容器才能正確計算大小）
let flatMap = null;
const flatMarkers = {}; // 旅程 id → 平面地圖上的圖釘
function initFlatMap() {
  if (!window.L) {
    document.getElementById("map").innerHTML = '<p class="map-error">地圖暫時無法載入，請重新整理。</p>';
    return;
  }
  flatMap = L.map("map", {
    worldCopyJump: true,
    scrollWheelZoom: false,
    minZoom: 1,
    maxZoom: 7,
    attributionControl: false
  }).setView([25, 60], 2);

  // 底圖：內建的世界地圖（lib/world.js），不需要網路、也不需要任何金鑰
  L.geoJSON(WORLD, {
    interactive: false,
    style: feature => ({
      color: "#b9a68a",        // 國界線
      weight: 0.7,
      fillColor: visitedCountries.has(feature) ? "#efb59a" : "#efe2c6", // 去過的國家／其他陸地
      fillOpacity: 1
    })
  }).addTo(flatMap);

  // 點地圖後才允許滾輪縮放，避免捲動網頁時不小心縮放地圖
  flatMap.on("click", () => flatMap.scrollWheelZoom.enable());

  const pinIcon = L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [28, 28], iconAnchor: [14, 30] });
  const markers = trips.map(trip => {
    const marker = flatMarkers[trip.id] = L.marker([trip.lat, trip.lng], { icon: pinIcon, title: trip.title }).addTo(flatMap);
    marker.bindTooltip(trip.title, { direction: "top", offset: [0, -30], className: "pin-label" });
    marker.on("click", () => openJournal(trip));
    return marker;
  });

  // 從家出發的航線（彎彎的虛線，會慢慢流動）
  if (SITE.home) {
    const h = SITE.home;
    trips.forEach(trip => {
      const points = [];
      const dx = trip.lng - h.lng, dy = trip.lat - h.lat;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, bend = Math.sin(Math.PI * t) * 0.18; // 往旁邊彎一點
        points.push([h.lat + dy * t + dx * bend, h.lng + dx * t - dy * bend]);
      }
      L.polyline(points, { className: "flat-arc", color: "#c8553d", weight: 2, dashArray: "6 8", interactive: false }).addTo(flatMap);
    });
    L.marker([h.lat, h.lng], {
      icon: L.divIcon({ className: "", html: `<div class="home-dot"><span>${escapeHTML(h.name)}</span></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }),
      interactive: false
    }).addTo(flatMap);
  }

  // 讓所有圖釘都在畫面內
  if (markers.length > 1) {
    flatMap.fitBounds(L.featureGroup(markers).getBounds(), { padding: [50, 50], maxZoom: 5 });
  } else if (markers.length === 1) {
    flatMap.setView(markers[0].getLatLng(), 5);
  }
}

// ---------- 3D 地球（預設）與切換按鈕 ----------
const globeBox = document.getElementById("globe");
const mapBox = document.getElementById("map");
const globe = typeof initGlobe === "function" && initGlobe(globeBox, trips, [...visitedCountries], trip => openJournal(trip), SITE.home);

function showView(view) {
  const useGlobe = view === "globe" && globe;
  if (useGlobe) {
    mapBox.hidden = true;
    globe.show();
  } else {
    globe?.hide();
    mapBox.hidden = false;
    if (!flatMap) initFlatMap(); else flatMap.invalidateSize();
  }
  document.querySelectorAll(".view-toggle button").forEach(btn =>
    btn.setAttribute("aria-pressed", btn.dataset.view === (useGlobe ? "globe" : "flat")));
}

if (globe) {
  document.querySelector(".view-toggle").addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (btn) showView(btn.dataset.view);
  });
  showView("globe");
} else {
  // 不支援 3D 的瀏覽器：直接用平面地圖，隱藏切換按鈕
  document.querySelector(".view-toggle").hidden = true;
  globeBox.hidden = true;
  showView("flat");
}

// ---------- 旅程卡片 ----------
const list = document.getElementById("trip-list");
const tilts = [-2, 1.5, -1, 2, -1.5, 1];
list.innerHTML = trips.map((trip, i) => `
  <button class="polaroid" data-id="${escapeHTML(trip.id)}"
    style="--i:${i % 4}; --rot:${tilts[i % tilts.length]}deg; --c:${COLORS[i % COLORS.length]}; --stamp-rot:${(i % 2 ? 1 : -1) * (8 + i % 3 * 4)}deg">
    <span class="card-tape" aria-hidden="true"></span>
    <span class="photo-wrap">
      <span class="photo-clip">
        <img src="${escapeHTML(trip.cover || trip.photos[0]?.src)}" alt="${escapeHTML(trip.title)}" loading="lazy">
        <span class="badge">📷 ${trip.photos.length}</span>
      </span>
      <span class="passport-stamp" aria-hidden="true">${stampHTML(trip)}</span>
    </span>
    <h3>${escapeHTML(trip.title)}</h3>
    <p class="meta">📍 ${escapeHTML(trip.place)}</p>
    <p class="meta">🗓 ${dateRange(trip)}</p>
  </button>
`).join("");

// 卡片捲進畫面時才「飛」進來
const cards = list.querySelectorAll(".polaroid");
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
  }), { threshold: 0.15 });
  cards.forEach(card => io.observe(card));
} else {
  cards.forEach(card => card.classList.add("in"));
}

// 滑鼠移到清單項目上 → 地圖轉到對應的地方
let hoverTimer = null;
list.addEventListener("mouseover", e => {
  const card = e.target.closest(".polaroid");
  if (!card) return;
  clearTimeout(hoverTimer);
  // 稍微等一下再轉，滑鼠快速掃過好幾張卡片時不會一直亂轉
  hoverTimer = setTimeout(() => previewTrip(trips.find(t => t.id === card.dataset.id)), 120);
});
list.addEventListener("mouseleave", () => {
  clearTimeout(hoverTimer);
  if (globe) globe.highlight(null);
  Object.values(flatMarkers).forEach(m => m.closeTooltip());
});

let previewing = null;
function previewTrip(trip) {
  if (!trip || trip === previewing) return;
  previewing = trip;
  setTimeout(() => { if (previewing === trip) previewing = null; }, 1500);
  if (globe && !document.getElementById("globe").hidden) {
    globe.preview(trip);
  } else if (flatMap) {
    flatMap.flyTo([trip.lat, trip.lng], 4, { duration: 1 });
    Object.values(flatMarkers).forEach(m => m.closeTooltip());
    flatMarkers[trip.id].openTooltip();
  }
}

list.addEventListener("click", e => {
  const card = e.target.closest(".polaroid");
  if (!card) return;
  const trip = trips.find(t => t.id === card.dataset.id);
  openJournal(trip);
  if (globe) globe.focus(trip); // 關掉內頁時，地球已經轉到那個地方
});

// ---------- 旅程內頁 ----------
const journal = document.getElementById("journal");
let currentTrip = null;
let lastFocus = null;

function openJournal(trip) {
  currentTrip = trip;
  lastFocus = document.activeElement;
  document.getElementById("j-meta").textContent = `📍 ${trip.place}　${dateRange(trip)}`;
  document.getElementById("j-title").textContent = trip.title;
  const idx = trips.indexOf(trip);
  const stamp = document.getElementById("j-stamp");
  stamp.innerHTML = stampHTML(trip);
  stamp.style.setProperty("--c", COLORS[idx % COLORS.length]);
  document.getElementById("j-photos").innerHTML = trip.photos.map((p, i) => `
    <button class="j-photo" data-index="${i}" style="--i:${i}; --c:${COLORS[(idx + i + 1) % COLORS.length]}">
      <img src="${escapeHTML(p.src)}" alt="${escapeHTML(p.caption)}" loading="lazy">
      <span>${escapeHTML(p.caption)}</span>
    </button>
  `).join("");
  document.getElementById("j-story").innerHTML = (trip.story || "")
    .split(/\n\s*\n/).map(par => `<p>${escapeHTML(par).replaceAll("\n", "<br>")}</p>`).join("");

  // 讓開場動畫每次都重新播放
  const page = journal.querySelector(".journal-page");
  [page, stamp].forEach(el => { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; });
  journal.hidden = false;
  document.body.style.overflow = "hidden";
  journal.querySelector(".journal-page").scrollTop = 0;
  journal.querySelector(".close-btn").focus();
}

function closeJournal() {
  journal.hidden = true;
  document.body.style.overflow = "";
  lastFocus?.focus();
}

journal.addEventListener("click", e => {
  if (e.target.closest("[data-close]")) return closeJournal();
  const photo = e.target.closest(".j-photo");
  if (photo) openLightbox(Number(photo.dataset.index));
});

// ---------- 照片放大 ----------
const lightbox = document.getElementById("lightbox");
let photoIndex = 0;

function showPhoto() {
  const p = currentTrip.photos[photoIndex];
  document.getElementById("lb-img").src = p.src;
  document.getElementById("lb-img").alt = p.caption;
  document.getElementById("lb-caption").textContent = `${p.caption}（${photoIndex + 1} / ${currentTrip.photos.length}）`;
}
function openLightbox(i) {
  photoIndex = i;
  showPhoto();
  lightbox.hidden = false;
}
function stepPhoto(delta) {
  const n = currentTrip.photos.length;
  photoIndex = (photoIndex + delta + n) % n;
  showPhoto();
}

lightbox.querySelector(".lb-close").addEventListener("click", () => (lightbox.hidden = true));
lightbox.querySelector(".lb-prev").addEventListener("click", () => stepPhoto(-1));
lightbox.querySelector(".lb-next").addEventListener("click", () => stepPhoto(1));
lightbox.addEventListener("click", e => { if (e.target === lightbox) lightbox.hidden = true; });

// ---------- 鍵盤操作 ----------
document.addEventListener("keydown", e => {
  if (!lightbox.hidden) {
    if (e.key === "Escape") lightbox.hidden = true;
    if (e.key === "ArrowLeft") stepPhoto(-1);
    if (e.key === "ArrowRight") stepPhoto(1);
  } else if (!journal.hidden && e.key === "Escape") {
    closeJournal();
  }
});

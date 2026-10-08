/* =========================================================
   3D 地球（類似 Google Earth 的效果）—— 一般情況不需要修改
   使用 three.js 繪製：衛星影像、大氣光暈、星空、可拖曳旋轉與縮放
   ========================================================= */

function initGlobe(container, trips, visitedFeatures, onSelect, home) {
  // 瀏覽器不支援 3D（WebGL）時，回傳 null，網站會改用平面地圖
  if (!window.THREE || !THREE.OrbitControls || typeof EARTH_TEXTURE === "undefined" || typeof WORLD === "undefined") return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    return null;
  }

  // ---------- 基本場景 ----------
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x04060d);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  scene.add(camera);

  // 光線跟著相機，讓眼前的半球永遠是亮的，邊緣微暗，有立體感
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(-2, 1.5, 2);
  camera.add(sun);

  // ---------- 經緯度 → 3D 座標 ----------
  function toVector(lat, lng, radius = 1) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  // ---------- 地球本體 ----------
  const earthMaterial = new THREE.MeshPhongMaterial({ color: 0x223344, shininess: 6, specular: 0x222222 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMaterial);
  scene.add(earth);

  // 衛星影像＋國界線＋去過的國家上色，畫在同一張圖上再貼到地球
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const W = canvas.width, H = canvas.height;

    function tracePolygon(poly) {
      poly.forEach(ring => {
        let prevX = null;
        ring.forEach(([lng, lat], i) => {
          const x = (lng + 180) / 360 * W, y = (90 - lat) / 180 * H;
          // 跨越 180 度經線的線段不要連起來
          if (i === 0 || Math.abs(x - prevX) > W / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          prevX = x;
        });
      });
    }

    // 所有國界：淡淡的白線
    ctx.beginPath();
    WORLD.features.forEach(f => f.geometry.coordinates.forEach(tracePolygon));
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = W / 2600;
    ctx.stroke();

    // 去過的國家：暖橘色
    visitedFeatures.forEach(f => {
      ctx.beginPath();
      f.geometry.coordinates.forEach(tracePolygon);
      ctx.fillStyle = "rgba(255, 190, 140, 0.30)";
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255, 205, 160, 0.95)";
      ctx.lineWidth = W / 1300;
      ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    earthMaterial.map = texture;
    earthMaterial.color.set(0xffffff);
    earthMaterial.needsUpdate = true;
    container.classList.add("loaded");
  };
  img.src = EARTH_TEXTURE;

  // ---------- 大氣光暈 ----------
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 48),
    new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * intensity;
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    })
  );
  atmosphere.scale.setScalar(1.18);
  scene.add(atmosphere);

  // ---------- 航線：從家飛到每個目的地，光點沿著航線流動 ----------
  const arcs = new Map(); // 旅程 → 航線材質（用來調亮被選到的那條）
  const arcVertex = `
    attribute float progress;
    varying float vProgress;
    void main() {
      vProgress = progress;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const arcFragment = `
    uniform float time;
    uniform vec3 color;
    uniform float strength;
    varying float vProgress;
    void main() {
      float dash = fract(vProgress * 5.0 - time * 0.6);  // 一段一段往前跑的光
      float glow = 0.18 + 0.82 * pow(dash, 4.0);
      gl_FragColor = vec4(color, glow * strength);
    }`;
  if (home) {
    const start = toVector(home.lat, home.lng).normalize();
    trips.forEach((trip, i) => {
      const end = toVector(trip.lat, trip.lng).normalize();
      const angle = start.angleTo(end);
      if (angle < 0.001) return; // 目的地就是家
      const turn = new THREE.Quaternion().setFromUnitVectors(start, end);
      const lift = 0.04 + angle * 0.16; // 越遠的航線飛越高
      const positions = [], progress = [];
      for (let k = 0; k <= 80; k++) {
        const t = k / 80;
        const q = new THREE.Quaternion().slerp(turn, t);
        const v = start.clone().applyQuaternion(q).multiplyScalar(1 + Math.sin(Math.PI * t) * lift);
        positions.push(v.x, v.y, v.z);
        progress.push(t * angle);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("progress", new THREE.Float32BufferAttribute(progress, 1));
      const material = new THREE.ShaderMaterial({
        vertexShader: arcVertex,
        fragmentShader: arcFragment,
        uniforms: {
          time: { value: i * 0.37 },
          color: { value: new THREE.Color(0xffc48a) },
          strength: { value: 0.75 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      scene.add(new THREE.Line(geometry, material));
      arcs.set(trip, material);
    });
  }

  // ---------- 星空 ----------
  const starPositions = [];
  for (let i = 0; i < 2500; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 40);
    starPositions.push(v.x, v.y, v.z);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75
  })));

  // ---------- 滑鼠／觸控操作 ----------
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.25;
  controls.maxDistance = 9;
  controls.zoomSpeed = 0.6;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.enableZoom = false; // 點一下地球後才允許滾輪縮放，避免捲動網頁時誤觸

  renderer.domElement.addEventListener("pointerdown", () => { controls.enableZoom = true; });
  container.addEventListener("mouseleave", () => { controls.enableZoom = false; });

  // 使用者操作時停止自動旋轉，閒置 10 秒後再慢慢轉
  let idleTimer = null;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener("end", () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = true; }, 10000);
  });

  // 直式螢幕（手機）比較窄，相機要退遠一點才看得到整顆地球
  const fit = d => d * Math.max(1, 0.85 / (camera.aspect || 1));

  // 一開始面向亞洲
  camera.aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
  camera.position.copy(toVector(22, 118, fit(3.4)));
  controls.update();

  // ---------- 圖釘（HTML 元素，跟著地球轉動） ----------
  const pinLayer = document.createElement("div");
  pinLayer.className = "globe-pins";
  container.appendChild(pinLayer);

  let hoverPause = false;
  const pins = trips.map(trip => {
    const el = document.createElement("button");
    el.className = "gpin";
    el.innerHTML = `<span class="pulse"></span><span class="pin"></span><span class="gpin-label"></span>`;
    el.querySelector(".gpin-label").textContent = trip.title;
    el.setAttribute("aria-label", trip.title);
    el.addEventListener("click", () => { highlight(trip); flyTo(trip, () => onSelect(trip)); });
    // 滑鼠移到圖釘上時暫停旋轉，比較好點
    el.addEventListener("pointerenter", () => { hoverPause = true; });
    el.addEventListener("pointerleave", () => { hoverPause = false; });
    pinLayer.appendChild(el);
    return { el, trip, position: toVector(trip.lat, trip.lng, 1.005) };
  });

  // 家的位置：一個小光點
  if (home) {
    const el = document.createElement("div");
    el.className = "gpin ghome";
    el.innerHTML = `<span class="home-dot"><span></span></span>`;
    el.querySelector(".home-dot span").textContent = home.name;
    pinLayer.prepend(el);
    pins.push({ el, trip: null, position: toVector(home.lat, home.lng, 1.005) });
  }

  function highlight(trip) {
    pins.forEach(p => p.el.classList.toggle("active", !!trip && p.trip === trip));
    // 被選到的航線變亮、變色，其他的變淡
    arcs.forEach((material, t) => {
      material.uniforms.strength.value = !trip ? 0.75 : t === trip ? 1.6 : 0.3;
      material.uniforms.color.value.set(trip && t === trip ? 0xffe2a8 : 0xffc48a);
    });
  }

  const tmp = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  function updatePins(width, height) {
    pins.forEach(p => {
      // 在地球背面的圖釘要藏起來
      toCamera.copy(camera.position).sub(p.position);
      const facing = toCamera.normalize().dot(p.position.clone().normalize());
      if (facing < 0.08) {
        p.el.style.opacity = 0;
        p.el.style.pointerEvents = "none";
        return;
      }
      tmp.copy(p.position).project(camera);
      const x = (tmp.x + 1) / 2 * width;
      const y = (1 - tmp.y) / 2 * height;
      p.el.style.transform = `translate(${x}px, ${y}px)`;
      p.el.style.opacity = Math.min(1, (facing - 0.08) * 6);
      p.el.style.pointerEvents = "auto";
    });
  }

  // ---------- 飛到某個地點 ----------
  let flight = null;
  function flyTo(trip, done, distance = 1.9) {
    controls.autoRotate = false;
    controls.enabled = false;
    clearTimeout(idleTimer);
    const startDir = camera.position.clone().normalize();
    const endDir = toVector(trip.lat, trip.lng).normalize();
    const startDist = camera.position.length();
    const endDist = fit(distance);
    const turn = new THREE.Quaternion().setFromUnitVectors(startDir, endDir);
    const angle = startDir.angleTo(endDir);
    flight = {
      start: performance.now(),
      duration: 900 + angle * 600,
      lift: angle > 0.5 ? 0.6 : 0.15, // 距離遠時先拉高再降落，像 Google Earth
      startDir, startDist, endDist, turn, done
    };
  }

  function stepFlight(now) {
    const f = flight;
    const t = Math.min(1, (now - f.start) / f.duration);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // 緩入緩出
    const q = new THREE.Quaternion().slerp(f.turn, e);
    const dist = f.startDist + (f.endDist - f.startDist) * e + Math.sin(Math.PI * e) * f.lift;
    camera.position.copy(f.startDir).applyQuaternion(q).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
    if (t >= 1) {
      flight = null;
      controls.enabled = true;
      controls.update();
      idleTimer = setTimeout(() => { controls.autoRotate = true; }, 10000);
      f.done?.();
    }
  }

  // ---------- 畫面大小 ----------
  let width = 0, height = 0;
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // ---------- 動畫迴圈（地球不在畫面上時暫停，省電） ----------
  let running = false, onScreen = true;
  function frame(now) {
    if (!running) return;
    if (flight) stepFlight(now);
    else {
      controls.rotateSpeed = Math.max(0.08, (camera.position.length() - 1) * 0.35); // 拉近時轉慢一點
      const wantRotate = controls.autoRotate;
      if (hoverPause) controls.autoRotate = false;
      controls.update();
      controls.autoRotate = wantRotate;
    }
    arcs.forEach(material => { material.uniforms.time.value += 0.016; });
    renderer.render(scene, camera);
    updatePins(width, height);
    requestAnimationFrame(frame);
  }
  function setRunning(value) {
    if (value && !running) { running = true; requestAnimationFrame(frame); }
    running = value;
  }
  new IntersectionObserver(entries => {
    onScreen = entries[0].isIntersecting;
    setRunning(onScreen && !container.hidden);
  }).observe(container);

  return {
    focus: trip => { flyTo(trip); highlight(trip); },
    // 滑鼠移到清單項目上：飛到那裡（不拉太近，保留周圍的地理位置感），並標出圖釘
    preview: trip => { flyTo(trip, null, 2.5); highlight(trip); },
    highlight,
    show() { container.hidden = false; resize(); setRunning(onScreen); },
    hide() { container.hidden = true; setRunning(false); }
  };
}

const app = document.querySelector("#app");
const cityNav = document.querySelector("#city-nav");
const profileNav = document.querySelector("#profile-nav");
const brand = document.querySelector(".brand");
const preferenceKey = "stelvio-portfolio-preferences-v1";

let sourceProjects = [];
let projects = [];
let aboutPhotos = [];
let publishedPreferences = {};
let homeIndex = 0;
let photoIndex = 0;
let activeCity = "All";
let activeProjectSlug = "";
let direction = "next";
let viewerGestureMoved = false;
let viewerPointerStart = null;
let viewerSwipeTriggered = false;
let transitionLocked = false;
let homeTargetIndex = null;
let homeRequestToken = 0;
let homeTransitionToken = 0;
let photoTargetIndex = null;
let photoRequestToken = 0;
let photoTransitionToken = 0;
let lightboxIndex = 0;
let lightboxMode = "about";
let lightboxLocked = false;
let lightboxTargetIndex = null;
let lightboxRequestToken = 0;
let lightboxTransitionToken = 0;
let lightboxReturnFocus = null;
let lightboxScale = 1;
let lightboxPanX = 0;
let lightboxPanY = 0;
let lightboxPointers = new Map();
let lightboxDragStart = null;
let lightboxPinchStart = null;
let lightboxGestureMoved = false;
let lightboxSwipeTriggered = false;
const imageDecodeCache = new Map();

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const pad = (value) => String(value).padStart(2, "0");

const architectWebsiteRules = [
  ["Amateur Architecture Studio", "https://www.amarch.cc/"],
  ["Atelier X", "http://atelier-xuk.com/"],
  ["Atelier Deshaus", "https://www.deshaus.com/"],
  ["Atelier FCJZ", "https://www.fcjz.com/"],
  ["Ateliers Jean Nouvel", "https://www.jeannouvel.com/"],
  ["Jean Nouvel", "https://www.jeannouvel.com/"],
  ["azLa", "https://www.azlarchitects.com/"],
  ["BIG", "https://big.dk/"],
  ["Delugan Meissl", "https://www.dmaa.at/"],
  ["Pei Cobb Freed", "https://www.pcf-p.com/"],
  ["Integrated Design Associates", "http://www.ida-hk.com/"],
  ["Jiakun Architects", "https://www.jiakun.com/"],
  ["Junya Ishigami", "https://jnyi.jp/"],
  ["Kengo Kuma", "https://kkaa.co.jp/"],
  ["Le Corbusier", "https://www.fondationlecorbusier.fr/"],
  ["OMA", "https://www.oma.com/"],
  ["Perkins&Will", "https://perkinswill.com/"],
  ["Renzo Piano", "https://www.rpbw.com/"],
  ["Riken Yamamoto", "https://riken-yamamoto.co.jp/"],
  ["SANAA", "https://www.sanaa.co.jp/"],
  ["SelgasCano", "http://www.selgascano.net/"],
  ["Sou Fujimoto", "https://www.sou-fujimoto.net/"],
  ["Steven Holl", "https://www.stevenholl.com/"],
  ["Tadao Ando", "https://www.tadao-ando.com/"],
  ["Zaha Hadid", "https://www.zha.com/"],
];

function architectCredit(name) {
  const website = architectWebsiteRules.find(([label]) => name.includes(label))?.[1];
  const credit = escapeHtml(name);
  return website
    ? `<a class="architect-link" href="${website}" target="_blank" rel="noreferrer">${credit}</a>`
    : credit;
}

function readPreferences() {
  try {
    return JSON.parse(localStorage.getItem(preferenceKey)) || {};
  } catch {
    return {};
  }
}

function applyPreferenceSet(data, preferences = {}) {
  const bySlug = new Map(data.map((project) => [project.slug, project]));
  const ordered = [];

  (preferences.order || []).forEach((slug) => {
    const project = bySlug.get(slug);
    if (project) {
      ordered.push(project);
      bySlug.delete(slug);
    }
  });
  ordered.push(...bySlug.values());

  return ordered.map((project) => {
    const selected = project.images.find((image) => image.src === preferences.covers?.[project.slug]);
    return selected
      ? { ...project, coverSrc: selected.src, coverWidth: selected.width, coverHeight: selected.height }
      : { ...project };
  });
}

function applyPreferences(data) {
  return applyPreferenceSet(applyPreferenceSet(data, publishedPreferences), readPreferences());
}

const route = () => {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw.startsWith("project/")) {
    return { view: "project", value: decodeURIComponent(raw.slice(8)) };
  }
  if (raw === "projects") return { view: "archive", value: "All" };
  if (raw === "about") return { view: "about", value: "All" };
  if (raw === "contact") return { view: "contact", value: "All" };
  if (raw.startsWith("city/")) {
    return { view: "archive", value: decodeURIComponent(raw.slice(5)) };
  }
  return { view: "landing", value: "All" };
};

const cityHref = (city) =>
  city === "All" ? "#projects" : `#city/${encodeURIComponent(city)}`;

function visibleProjects(city = activeCity) {
  return city === "All" ? projects : projects.filter((project) => project.city === city);
}

function renderNav(currentCity = null) {
  const cities = [...new Set(projects.map((project) => project.city))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
  const links = [
    { label: "All", href: "#projects", current: currentCity === "All" },
    ...cities.map((city) => ({
      label: city,
      href: cityHref(city),
      current: city === currentCity,
    })),
  ];

  cityNav.innerHTML = links
    .map(
      (link) =>
        `<a href="${link.href}" ${link.current ? 'aria-current="page"' : ""}>${escapeHtml(link.label)}</a>`,
    )
    .join("");
}

function syncProfileNav(currentView) {
  profileNav.querySelectorAll("a").forEach((link) => {
    const current = link.getAttribute("href") === `#${currentView}`;
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function prepareImage(src) {
  if (!src) return Promise.resolve();
  if (imageDecodeCache.has(src)) return imageDecodeCache.get(src);

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
    if (image.complete) resolve();
  }).then(() => {
    const decoded = new Image();
    decoded.decoding = "async";
    decoded.src = src;
    return typeof decoded.decode === "function" ? decoded.decode().catch(() => {}) : undefined;
  });

  imageDecodeCache.set(src, promise);
  return promise;
}

function preload(sources) {
  sources.filter(Boolean).forEach((src) => prepareImage(src));
}

function preloadAround(items, index, getSource, radius = 2) {
  if (!items.length) return;
  const sources = [];
  for (let offset = 1; offset <= Math.min(radius, items.length - 1); offset += 1) {
    sources.push(
      getSource(items[(index - offset + items.length) % items.length]),
      getSource(items[(index + offset) % items.length]),
    );
  }
  preload(sources);
}

function syncHomePagingCues() {
  const viewer = app.querySelector(".viewer--home");
  if (!viewer) return;
  if (!window.matchMedia("(max-width: 720px)").matches) {
    viewer.style.removeProperty("--home-previous-cue-offset");
    viewer.style.removeProperty("--home-next-cue-offset");
    return;
  }

  const image = viewer.querySelector(".carousel-incoming .viewer-image")
    || viewer.querySelector(".viewer-stage:not(.carousel-outgoing) .viewer-image")
    || viewer.querySelector(".viewer-image");
  if (!image) return;
  const viewerRect = viewer.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  if (imageRect.width < 1) return;
  const cueSize = 7;
  const previousGap = Math.max(0, imageRect.left - viewerRect.left);
  const nextGap = Math.max(0, viewerRect.right - imageRect.right);
  viewer.style.setProperty("--home-previous-cue-offset", `${Math.max(3, (previousGap - cueSize) / 2)}px`);
  viewer.style.setProperty("--home-next-cue-offset", `${Math.max(3, (nextGap - cueSize) / 2)}px`);
}

function projectImageFrame(image) {
  return `
    <div class="viewer-image-frame">
      <img
        class="viewer-image viewer-image--natural"
        src="${image.src}"
        width="${image.width}"
        height="${image.height}"
        alt="${escapeHtml(image.alt)}"
        loading="eager"
        fetchpriority="high"
        decoding="async"
      />
    </div>`;
}

function viewerButtons(previousLabel, nextLabel, previousAction, nextAction) {
  return `
    <button class="viewer-arrow viewer-arrow--previous" type="button" tabindex="-1" data-action="${previousAction}" aria-label="${escapeHtml(previousLabel)}"></button>
    <button class="viewer-arrow viewer-arrow--next" type="button" tabindex="-1" data-action="${nextAction}" aria-label="${escapeHtml(nextLabel)}"></button>`;
}

function fullscreenControl() {
  return `
    <button class="fullscreen-toggle" type="button" data-action="toggle-fullscreen" aria-label="Enter fullscreen" aria-pressed="false" title="Enter fullscreen">
      <svg class="fullscreen-icon fullscreen-icon--enter" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.5 6V1.5H6M10 1.5h4.5V6M14.5 10v4.5H10M6 14.5H1.5V10" />
      </svg>
      <svg class="fullscreen-icon fullscreen-icon--exit" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 1.5V6H1.5M14.5 6H10V1.5M10 14.5V10h4.5M1.5 10H6v4.5" />
      </svg>
    </button>`;
}

const isFullscreen = () =>
  Boolean(document.fullscreenElement || document.documentElement.matches(":fullscreen"));

function syncFullscreenControls() {
  const active = isFullscreen();
  app.querySelectorAll(".fullscreen-toggle").forEach((control) => {
    const label = active ? "Exit fullscreen" : "Enter fullscreen";
    control.dataset.fullscreenActive = String(active);
    control.setAttribute("aria-label", label);
    control.setAttribute("aria-pressed", String(active));
    control.title = label;
    control.hidden = !document.fullscreenEnabled;
  });
}

async function toggleFullscreen() {
  if (window.matchMedia("(max-width: 720px)").matches) return;
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    console.error("Fullscreen could not be changed.", error);
  }
}

function landingStageMarkup(index) {
  const normalizedIndex = ((index % projects.length) + projects.length) % projects.length;
  const project = projects[normalizedIndex];
  const previous = projects[(normalizedIndex - 1 + projects.length) % projects.length];
  const next = projects[(normalizedIndex + 1) % projects.length];

  return `
    <div class="viewer-stage">
      <a class="viewer-media viewer-media--link" href="#project/${project.slug}" aria-label="Open ${escapeHtml(project.title)} details">
        <img
          class="viewer-image"
          src="${project.coverSrc}"
          width="${project.coverWidth}"
          height="${project.coverHeight}"
          alt="${escapeHtml(project.title)}, ${escapeHtml(project.city)}"
          loading="eager"
          fetchpriority="high"
          decoding="async"
        />
      </a>
      <aside class="viewer-caption">
        <h1 id="project-title"><a href="#project/${project.slug}">${escapeHtml(project.title)}</a></h1>
        <dl class="project-meta">
          <dt>Architect</dt>
          <dd>${architectCredit(project.architect)}</dd>
          <dt>City</dt>
          <dd>${escapeHtml(project.city)}</dd>
          <dt>Photographed</dt>
          <dd>${escapeHtml(project.shootingDate)}</dd>
          <dt>Camera</dt>
          <dd>${escapeHtml(project.camera)}</dd>
          <dt>Focal Length</dt>
          <dd>${escapeHtml(project.focalLength)}</dd>
        </dl>
        <p class="project-description">${escapeHtml(project.description)}</p>
        <div class="viewer-caption-footer">
          <a class="view-project" href="#projects">Projects</a>
          <span class="viewer-tools">
            <span class="viewer-counter" aria-live="polite">${pad(normalizedIndex + 1)} / ${pad(projects.length)}</span>
            ${fullscreenControl()}
          </span>
        </div>
      </aside>
      ${viewerButtons(`Previous project: ${previous.title}`, `Next project: ${next.title}`, "home-previous", "home-next")}
    </div>`;
}

function renderLanding() {
  homeIndex = ((homeIndex % projects.length) + projects.length) % projects.length;
  homeTargetIndex = null;
  const project = projects[homeIndex];
  document.body.dataset.view = "landing";
  document.title = `${project.title} — Stelvio J`;
  renderNav();

  app.innerHTML = `
    <section class="viewer viewer--home is-${direction}" aria-labelledby="project-title">
      ${landingStageMarkup(homeIndex)}
    </section>`;

  preloadAround(projects, homeIndex, (item) => item.coverSrc);
  requestAnimationFrame(syncHomePagingCues);
  syncFullscreenControls();
}

function renderArchive(city = "All") {
  const normalizedCity = projects.some((project) => project.city === city) ? city : "All";
  activeCity = normalizedCity;
  const visible = visibleProjects();

  document.body.dataset.view = "archive";
  document.title = `${normalizedCity === "All" ? "Projects" : normalizedCity} — Stelvio J`;
  renderNav(normalizedCity);

  const cards = visible
    .map(
      (project, order) => `
        <article class="archive-card" style="--order:${order}">
          <a href="#project/${encodeURIComponent(project.slug)}" aria-label="Open ${escapeHtml(project.title)}">
            <figure>
              <img
                src="${project.coverSrc}"
                width="${project.coverWidth}"
                height="${project.coverHeight}"
                alt="${escapeHtml(project.title)}, ${escapeHtml(project.city)}"
                ${order < 8 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}
                decoding="async"
              />
            </figure>
            <h2><span>${escapeHtml(project.title)}</span><span class="archive-card-date">${escapeHtml(project.shootingDate)}</span></h2>
          </a>
        </article>`,
    )
    .join("");

  app.innerHTML = `
    <section class="archive-view" aria-labelledby="archive-title">
      <header class="archive-toolbar">
        <h1 id="archive-title">${escapeHtml(normalizedCity === "All" ? "Projects" : normalizedCity)}</h1>
        <span>${pad(visible.length)} projects</span>
      </header>
      <div class="archive-grid">${cards}</div>
      <footer class="archive-footer">
        <p>&copy; 2026 Stelvio J. All rights reserved.</p>
        <p>Designed and built with Codex.</p>
      </footer>
    </section>`;
}

function lightboxPhotos() {
  if (lightboxMode === "project") {
    const project = projects.find((item) => item.slug === activeProjectSlug);
    return (project?.images || []).map((image) => ({
      full: image.src,
      width: image.width,
      height: image.height,
      category: project.title,
      alt: image.alt,
    }));
  }
  return aboutPhotos;
}

function lightboxPhotoFrame(photo, index, className = "") {
  const alt = photo.alt || `28mm Within — ${photo.category} photograph ${index + 1}`;
  return `
    <div class="lightbox-frame ${className}">
      <img
        src="${photo.full}"
        width="${photo.width}"
        height="${photo.height}"
        alt="${escapeHtml(alt)}"
        loading="eager"
        fetchpriority="high"
        decoding="async"
      />
    </div>`;
}

function lightboxMarkup(title) {
  return `
    <div class="lightbox" hidden role="dialog" aria-modal="true" aria-labelledby="lightbox-title">
      <h2 class="visually-hidden" id="lightbox-title">${escapeHtml(title)}</h2>
      <div class="lightbox-backdrop" data-action="close-lightbox"></div>
      <div class="lightbox-shell">
        <button class="lightbox-close" type="button" data-action="close-lightbox">Close</button>
        <div class="lightbox-stage" aria-live="polite"></div>
        <button class="lightbox-arrow lightbox-arrow--previous" type="button" tabindex="-1" data-action="lightbox-previous" aria-label="Previous photograph"></button>
        <button class="lightbox-arrow lightbox-arrow--next" type="button" tabindex="-1" data-action="lightbox-next" aria-label="Next photograph"></button>
        <div class="lightbox-meta">
          <span class="lightbox-category"></span>
          <span class="lightbox-counter"></span>
        </div>
      </div>
    </div>`;
}

function renderAbout() {
  document.body.dataset.view = "about";
  document.title = "About — Stelvio J";
  renderNav();
  syncProfileNav("about");

  const gallery = aboutPhotos.length
    ? aboutPhotos.map((photo, index) => `
        <figure class="about-photo" style="--order:${index}">
          <button type="button" data-action="open-about-photo" data-index="${index}" aria-label="Enlarge ${escapeHtml(photo.category)} photograph ${index + 1}">
            <img
              src="${photo.thumb}"
              width="${photo.thumbWidth}"
              height="${photo.thumbHeight}"
              alt="28mm Within — ${escapeHtml(photo.category)} photograph ${index + 1}"
              ${index < 4 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}
              decoding="async"
            />
          </button>
          <figcaption>${escapeHtml(photo.category)} <span>${pad(index + 1)}</span></figcaption>
        </figure>`).join("")
    : '<p class="gallery-empty">The photography selection is being prepared.</p>';

  app.innerHTML = `
    <section class="profile-view about-view" aria-labelledby="about-title">
      <header class="profile-intro">
        <p class="profile-kicker">About / Stelvio J</p>
        <h1 id="about-title">Jiang Ruiqi</h1>
        <p class="profile-statement">Jiang Ruiqi is an undergraduate architecture student at Nanjing Tech University and an amateur photographer based in Nanjing, China.</p>
      </header>
      <section class="photography-selection" aria-labelledby="photography-title">
        <header class="selection-header">
          <h2 id="photography-title">28mm Within</h2>
          <p>Urban / Nature / Life</p>
          <span>${pad(aboutPhotos.length)} photographs</span>
        </header>
        <div class="about-gallery">${gallery}</div>
      </section>
    </section>
    ${lightboxMarkup("28mm Within photograph viewer")}`;
}

function renderContact() {
  document.body.dataset.view = "contact";
  document.title = "Contact — Stelvio J";
  renderNav();
  syncProfileNav("contact");

  app.innerHTML = `
    <section class="profile-view contact-view" aria-labelledby="contact-title">
      <header class="profile-intro contact-intro">
        <p class="profile-kicker">Contact / Stelvio J</p>
        <div class="contact-identity">
          <h1 id="contact-title">Jiang Ruiqi</h1>
          <p class="profile-statement">For architecture, photography, and other enquiries.</p>
        </div>
      </header>
      <dl class="contact-list">
        <div>
          <dt>Email</dt>
          <dd><a href="mailto:stelvioj348@gmail.com">stelvioj348@gmail.com</a></dd>
        </div>
        <div>
          <dt>WeChat</dt>
          <dd>StelvioJ</dd>
        </div>
        <div>
          <dt>Xiaohongshu</dt>
          <dd>5676817050</dd>
        </div>
        <div>
          <dt>Instagram</dt>
          <dd><a href="https://www.instagram.com/stelvio215/" target="_blank" rel="noreferrer">@stelvio215</a></dd>
        </div>
      </dl>
    </section>`;
}

function updateLightboxMeta(index = lightboxIndex) {
  const photos = lightboxPhotos();
  const photo = photos[index];
  const lightbox = app.querySelector(".lightbox");
  if (!photo || !lightbox) return;
  const category = lightbox.querySelector(".lightbox-category");
  const counter = lightbox.querySelector(".lightbox-counter");
  if (category) category.textContent = lightboxMode === "project" ? photo.category : `28mm Within / ${photo.category}`;
  if (counter) counter.textContent = `${pad(index + 1)} / ${pad(photos.length)}`;
}

function preloadLightboxNeighbors(index = lightboxIndex) {
  const photos = lightboxPhotos();
  preloadAround(photos, index, (photo) => photo.full);
}

function activeLightboxImage() {
  return app.querySelector(".lightbox:not([hidden]) .lightbox-frame:not(.lightbox-frame--outgoing) img");
}

function clampLightboxPan(scale, panX, panY) {
  const image = activeLightboxImage();
  const stage = app.querySelector(".lightbox:not([hidden]) .lightbox-stage");
  if (!image || !stage) return { x: 0, y: 0 };
  const maxX = Math.max(0, (image.offsetWidth * scale - stage.clientWidth) / 2);
  const maxY = Math.max(0, (image.offsetHeight * scale - stage.clientHeight) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, panX)),
    y: Math.max(-maxY, Math.min(maxY, panY)),
  };
}

function applyLightboxTransform(scale, panX, panY) {
  const image = activeLightboxImage();
  const lightbox = app.querySelector(".lightbox:not([hidden])");
  if (!image || !lightbox) return;
  const nextScale = Math.max(1, Math.min(5, scale));
  const nextPan = clampLightboxPan(nextScale, panX, panY);
  lightboxScale = nextScale;
  lightboxPanX = nextScale === 1 ? 0 : nextPan.x;
  lightboxPanY = nextScale === 1 ? 0 : nextPan.y;
  image.style.transform = `translate3d(${lightboxPanX}px, ${lightboxPanY}px, 0) scale(${lightboxScale})`;
  lightbox.classList.toggle("is-zoomed", lightboxScale > 1);
}

function zoomLightboxAt(scale, clientX, clientY) {
  const stage = app.querySelector(".lightbox:not([hidden]) .lightbox-stage");
  if (!stage) return;
  const stageRect = stage.getBoundingClientRect();
  const centerX = stageRect.left + stageRect.width / 2;
  const centerY = stageRect.top + stageRect.height / 2;
  const nextScale = Math.max(1, Math.min(5, scale));
  const ratio = nextScale / lightboxScale;
  const relativeX = clientX - centerX - lightboxPanX;
  const relativeY = clientY - centerY - lightboxPanY;
  applyLightboxTransform(
    nextScale,
    lightboxPanX + relativeX * (1 - ratio),
    lightboxPanY + relativeY * (1 - ratio),
  );
}

function resetLightboxTransform() {
  app.querySelectorAll(".lightbox-stage img").forEach((image) => image.style.removeProperty("transform"));
  app.querySelector(".lightbox")?.classList.remove("is-zoomed", "is-dragging");
  lightboxScale = 1;
  lightboxPanX = 0;
  lightboxPanY = 0;
  lightboxPointers.clear();
  lightboxDragStart = null;
  lightboxPinchStart = null;
}

function openLightbox(index, mode = "about") {
  lightboxRequestToken += 1;
  lightboxTransitionToken += 1;
  lightboxTargetIndex = null;
  lightboxLocked = false;
  lightboxMode = mode;
  lightboxGestureMoved = false;
  const photos = lightboxPhotos();
  const lightbox = app.querySelector(".lightbox");
  if (!lightbox || !photos.length) return;
  lightboxIndex = ((Number(index) % photos.length) + photos.length) % photos.length;
  resetLightboxTransform();
  lightboxReturnFocus = document.activeElement;
  lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  lightbox.querySelector(".lightbox-stage").innerHTML = '<p class="lightbox-loading" role="status">Loading photograph…</p>';
  updateLightboxMeta();
  requestAnimationFrame(() => lightbox.classList.add("is-open"));
  lightbox.querySelector(".lightbox-close")?.focus({ preventScroll: true });

  const photo = photos[lightboxIndex];
  const requestToken = lightboxRequestToken;
  prepareImage(photo.full);
  if (lightbox.hidden || requestToken !== lightboxRequestToken) return;
  lightbox.querySelector(".lightbox-stage").innerHTML = lightboxPhotoFrame(photo, lightboxIndex);
  preloadLightboxNeighbors();
}

function closeLightbox() {
  const lightbox = app.querySelector(".lightbox");
  if (!lightbox || lightbox.hidden) return;
  lightbox.classList.remove("is-open");
  lightboxRequestToken += 1;
  lightboxTransitionToken += 1;
  lightboxTargetIndex = null;
  resetLightboxTransform();
  lightboxGestureMoved = false;
  lightbox.hidden = true;
  lightboxLocked = false;
  document.body.classList.remove("lightbox-open");
  lightboxReturnFocus?.focus?.({ preventScroll: true });
  lightboxReturnFocus = null;
}

function moveLightbox(step) {
  const photos = lightboxPhotos();
  const lightbox = app.querySelector(".lightbox");
  if (!lightbox || lightbox.hidden || !photos.length) return;
  resetLightboxTransform();
  const baseIndex = lightboxTargetIndex ?? lightboxIndex;
  const nextIndex = (baseIndex + step + photos.length) % photos.length;
  const nextPhoto = photos[nextIndex];
  const stage = lightbox.querySelector(".lightbox-stage");
  if (!stage) return;

  const requestToken = ++lightboxRequestToken;
  lightboxTargetIndex = nextIndex;
  lightboxLocked = true;
  prepareImage(nextPhoto.full);
  if (lightbox.hidden || requestToken !== lightboxRequestToken) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    stage.innerHTML = lightboxPhotoFrame(nextPhoto, nextIndex);
    lightboxIndex = nextIndex;
    lightboxTargetIndex = null;
    updateLightboxMeta();
    preloadLightboxNeighbors();
    lightboxLocked = false;
    return;
  }

  const moveDirection = step > 0 ? "next" : "previous";
  const activeIncoming = stage.querySelector(".lightbox-frame--incoming");
  const settled = stage.querySelector(".lightbox-frame:not(.lightbox-frame--incoming):not(.lightbox-frame--outgoing)");
  const outgoing = activeIncoming || settled;
  if (!outgoing) return;
  let incomingShift = moveDirection === "next" ? 110 : -110;

  stage.querySelectorAll(".lightbox-frame--outgoing").forEach((layer) => layer.remove());
  if (activeIncoming) {
    const stageWidth = Math.max(1, stage.getBoundingClientRect().width);
    const currentShift = carouselTranslateX(activeIncoming) / stageWidth * 100;
    incomingShift = currentShift + (moveDirection === "next" ? 110 : -110);
    retargetCarouselLayer(
      activeIncoming,
      ["lightbox-frame--incoming", "is-next", "is-previous"],
      ["lightbox-frame--outgoing", `is-${moveDirection}`],
    );
  } else {
    outgoing.classList.add("lightbox-frame--outgoing", `is-${moveDirection}`);
    outgoing.getBoundingClientRect();
  }
  outgoing.setAttribute("aria-hidden", "true");

  const template = document.createElement("template");
  template.innerHTML = lightboxPhotoFrame(nextPhoto, nextIndex, `lightbox-frame--incoming is-${moveDirection}`).trim();
  const incoming = template.content.firstElementChild;
  stage.classList.add("lightbox-stage--moving");
  stage.append(incoming);
  stage.classList.add("lightbox-stage--active");
  introduceCarouselLayer(incoming, incomingShift);
  updateLightboxMeta(nextIndex);

  const transitionToken = ++lightboxTransitionToken;
  let finished = false;
  const finish = () => {
    if (finished || transitionToken !== lightboxTransitionToken) return;
    finished = true;
    stage.querySelectorAll(".lightbox-frame").forEach((layer) => {
      if (layer !== incoming) layer.remove();
    });
    incoming.className = "lightbox-frame";
    incoming.style.removeProperty("transition");
    incoming.style.removeProperty("transform");
    stage.classList.remove("lightbox-stage--moving", "lightbox-stage--active");
    lightboxIndex = nextIndex;
    lightboxTargetIndex = null;
    updateLightboxMeta();
    preloadLightboxNeighbors();
    lightboxLocked = false;
  };
  incoming.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 1650);
}

function renderProject(slug) {
  const project = projects.find((item) => item.slug === slug);
  if (!project) {
    window.location.hash = "projects";
    return;
  }

  if (activeProjectSlug !== slug) photoIndex = 0;
  activeProjectSlug = slug;
  photoTargetIndex = null;
  photoIndex = ((photoIndex % project.images.length) + project.images.length) % project.images.length;

  const image = project.images[photoIndex];
  document.body.dataset.view = "project";
  document.title = `${project.title} — Stelvio J`;
  renderNav(project.city);

  app.innerHTML = `
    <article class="viewer viewer--project is-${direction}" aria-labelledby="project-title">
      <div class="viewer-stage">
        <figure class="viewer-media">${projectImageFrame(image)}</figure>
        <aside class="viewer-caption">
          <h1 id="project-title">${escapeHtml(project.title)}</h1>
          <dl class="project-meta">
            <dt>Architect</dt>
            <dd>${architectCredit(project.architect)}</dd>
            <dt>City</dt>
            <dd>${escapeHtml(project.city)}</dd>
            <dt>Photographed</dt>
            <dd>${escapeHtml(project.shootingDate)}</dd>
            <dt>Camera</dt>
            <dd>${escapeHtml(project.camera)}</dd>
            <dt>Focal Length</dt>
            <dd>${escapeHtml(project.focalLength)}</dd>
          </dl>
          <p class="project-description">${escapeHtml(project.description)}</p>
          <div class="viewer-caption-footer">
            <a class="back-link" href="${cityHref(activeCity)}">← Projects</a>
            <span class="viewer-tools">
              <span class="viewer-counter" aria-live="polite">${pad(photoIndex + 1)} / ${pad(project.images.length)}</span>
              ${fullscreenControl()}
            </span>
          </div>
        </aside>
        ${viewerButtons("Previous photograph", "Next photograph", "photo-previous", "photo-next")}
      </div>
    </article>
    ${lightboxMarkup(`${project.title} photograph viewer`)}`;

  preloadAround(project.images, photoIndex, (item) => item.src);
  syncFullscreenControls();
}

function retargetCarouselLayer(layer, removeClasses, addClasses) {
  const transform = getComputedStyle(layer).transform;
  layer.style.transition = "none";
  layer.style.transform = transform;
  layer.classList.remove(...removeClasses);
  layer.classList.add(...addClasses);
  layer.getBoundingClientRect();
  requestAnimationFrame(() => {
    layer.style.removeProperty("transition");
    layer.style.removeProperty("transform");
  });
}

function carouselTranslateX(layer) {
  const transform = getComputedStyle(layer).transform;
  if (!transform || transform === "none") return 0;
  const values = transform.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  return transform.startsWith("matrix3d") ? values[12] || 0 : values[4] || 0;
}

function introduceCarouselLayer(layer, shift) {
  layer.style.transition = "none";
  layer.style.transform = `translate3d(${shift}%, 0, 0)`;
  layer.getBoundingClientRect();
  requestAnimationFrame(() => {
    layer.style.removeProperty("transition");
    layer.style.removeProperty("transform");
  });
}

function moveHome(step) {
  const baseIndex = homeTargetIndex ?? homeIndex;
  const nextIndex = (baseIndex + step + projects.length) % projects.length;
  const nextProject = projects[nextIndex];
  const requestToken = ++homeRequestToken;
  homeTargetIndex = nextIndex;
  direction = step > 0 ? "next" : "previous";
  const moveDirection = direction;
  prepareImage(nextProject.coverSrc);

  if (requestToken !== homeRequestToken || route().view !== "landing") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    homeIndex = nextIndex;
    renderLanding();
    return;
  }

  const viewer = app.querySelector(".viewer--home");
  if (!viewer) return;
  const activeIncoming = viewer.querySelector(".carousel-incoming");
  const settled = viewer.querySelector(".viewer-stage:not(.carousel-layer)");
  const outgoing = activeIncoming || settled;
  if (!outgoing) return;
  let incomingShift = moveDirection === "next" ? 100 : -100;

  viewer.querySelectorAll(".carousel-outgoing").forEach((layer) => layer.remove());
  if (activeIncoming) {
    const viewerWidth = Math.max(1, viewer.getBoundingClientRect().width);
    const currentShift = carouselTranslateX(activeIncoming) / viewerWidth * 100;
    incomingShift = currentShift + (moveDirection === "next" ? 100 : -100);
    retargetCarouselLayer(
      activeIncoming,
      ["carousel-incoming", "carousel-next", "carousel-previous"],
      ["carousel-outgoing", `carousel-${moveDirection}`],
    );
  } else {
    outgoing.classList.add("carousel-layer", "carousel-outgoing", `carousel-${moveDirection}`);
    outgoing.getBoundingClientRect();
  }
  outgoing.setAttribute("aria-hidden", "true");

  const template = document.createElement("template");
  template.innerHTML = landingStageMarkup(nextIndex).trim();
  const incoming = template.content.firstElementChild;
  incoming.classList.add("carousel-layer", "carousel-incoming", `carousel-${moveDirection}`);
  viewer.classList.add("carousel-transition", "carousel-active");
  viewer.append(incoming);
  introduceCarouselLayer(incoming, incomingShift);
  requestAnimationFrame(syncHomePagingCues);

  document.title = `${nextProject.title} — Stelvio J`;
  renderNav();
  syncFullscreenControls();
  transitionLocked = true;
  const transitionToken = ++homeTransitionToken;
  let finished = false;
  const finish = () => {
    if (finished || transitionToken !== homeTransitionToken) return;
    finished = true;
    viewer.querySelectorAll(".viewer-stage").forEach((layer) => {
      if (layer !== incoming) layer.remove();
    });
    incoming.classList.add("carousel-settled");
    incoming.classList.remove("carousel-layer", "carousel-incoming", "carousel-next", "carousel-previous");
    incoming.style.removeProperty("transition");
    incoming.style.removeProperty("transform");
    viewer.classList.remove("carousel-transition", "carousel-active");
    homeIndex = nextIndex;
    homeTargetIndex = null;
    transitionLocked = false;
    preloadAround(projects, homeIndex, (item) => item.coverSrc);
    syncHomePagingCues();
  };
  incoming.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 1650);
}

function movePhoto(step) {
  const project = projects.find((item) => item.slug === route().value);
  if (!project?.images.length) return;
  const baseIndex = photoTargetIndex ?? photoIndex;
  const nextIndex = (baseIndex + step + project.images.length) % project.images.length;
  const nextImage = project.images[nextIndex];
  const media = app.querySelector(".viewer--project .viewer-media");
  if (!media) return;

  direction = step > 0 ? "next" : "previous";
  const moveDirection = direction;
  const requestToken = ++photoRequestToken;
  photoTargetIndex = nextIndex;
  prepareImage(nextImage.src);

  if (requestToken !== photoRequestToken || route().view !== "project" || route().value !== project.slug) return;

  const incomingTemplate = document.createElement("template");
  incomingTemplate.innerHTML = projectImageFrame(nextImage).trim();
  const incoming = incomingTemplate.content.firstElementChild;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    media.replaceChildren(incoming);
    photoIndex = nextIndex;
    photoTargetIndex = null;
    const counter = app.querySelector(".viewer-counter");
    if (counter) counter.textContent = `${pad(photoIndex + 1)} / ${pad(project.images.length)}`;
    preloadAround(project.images, photoIndex, (item) => item.src);
    return;
  }

  const activeIncoming = media.querySelector(".media-carousel-incoming");
  const settled = media.querySelector(".viewer-image-frame:not(.media-carousel-layer)");
  const outgoing = activeIncoming || settled;
  if (!outgoing) return;

  media.querySelectorAll(".media-carousel-outgoing").forEach((layer) => layer.remove());
  if (activeIncoming) {
    retargetCarouselLayer(
      activeIncoming,
      ["media-carousel-incoming", "carousel-next", "carousel-previous"],
      ["media-carousel-outgoing", `carousel-${moveDirection}`],
    );
  } else {
    outgoing.classList.add("media-carousel-layer", "media-carousel-outgoing", `carousel-${moveDirection}`);
    outgoing.getBoundingClientRect();
  }
  incoming.classList.add("media-carousel-layer", "media-carousel-incoming", `carousel-${moveDirection}`);
  outgoing.setAttribute("aria-hidden", "true");
  media.classList.add("media-carousel-transition", "media-carousel-active");
  media.append(incoming);
  introduceCarouselLayer(incoming, moveDirection === "next" ? 110 : -110);
  const counter = app.querySelector(".viewer-counter");
  if (counter) counter.textContent = `${pad(nextIndex + 1)} / ${pad(project.images.length)}`;
  transitionLocked = true;

  const transitionToken = ++photoTransitionToken;
  let finished = false;
  const finish = () => {
    if (finished || transitionToken !== photoTransitionToken) return;
    finished = true;
    media.querySelectorAll(".viewer-image-frame").forEach((layer) => {
      if (layer !== incoming) layer.remove();
    });
    incoming.classList.add("carousel-settled");
    incoming.classList.remove("media-carousel-layer", "media-carousel-incoming", "carousel-next", "carousel-previous");
    incoming.style.removeProperty("transition");
    incoming.style.removeProperty("transform");
    media.classList.remove("media-carousel-transition", "media-carousel-active");
    photoIndex = nextIndex;
    photoTargetIndex = null;
    preloadAround(project.images, photoIndex, (item) => item.src);
    transitionLocked = false;
  };
  incoming.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 1650);
}

function moveCurrent(step) {
  const current = route();
  if (current.view === "project") movePhoto(step);
  if (current.view === "landing") moveHome(step);
}

function render() {
  if (!projects.length) return;
  homeRequestToken += 1;
  homeTransitionToken += 1;
  photoRequestToken += 1;
  photoTransitionToken += 1;
  lightboxRequestToken += 1;
  lightboxTransitionToken += 1;
  homeTargetIndex = null;
  photoTargetIndex = null;
  lightboxTargetIndex = null;
  transitionLocked = false;
  document.body.classList.remove("lightbox-open");
  lightboxLocked = false;
  const current = route();
  direction = "next";
  if (current.view === "project") renderProject(current.value);
  else if (current.view === "archive") renderArchive(current.value);
  else if (current.view === "about") renderAbout();
  else if (current.view === "contact") renderContact();
  else renderLanding();
  syncProfileNav(current.view);
  app.focus({ preventScroll: true });
}

app.addEventListener("click", (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  if (lightboxGestureMoved && control.dataset.action.startsWith("lightbox-")) {
    event.preventDefault();
    return;
  }
  if (viewerGestureMoved && ["home-previous", "home-next", "photo-previous", "photo-next"].includes(control.dataset.action)) {
    event.preventDefault();
    return;
  }
  const actions = {
    "home-previous": () => moveHome(-1),
    "home-next": () => moveHome(1),
    "photo-previous": () => movePhoto(-1),
    "photo-next": () => movePhoto(1),
    "toggle-fullscreen": toggleFullscreen,
    "open-about-photo": () => openLightbox(control.dataset.index),
    "close-lightbox": closeLightbox,
    "lightbox-previous": () => moveLightbox(-1),
    "lightbox-next": () => moveLightbox(1),
  };
  if (["home-previous", "home-next", "photo-previous", "photo-next", "lightbox-previous", "lightbox-next"].includes(control.dataset.action)) {
    control.blur();
  }
  actions[control.dataset.action]?.();
});

app.addEventListener("dblclick", (event) => {
  if (route().view !== "project" || !event.target.closest(".viewer--project .viewer-image-frame")) return;
  openLightbox(photoTargetIndex ?? photoIndex, "project");
});

app.addEventListener("load", (event) => {
  if (event.target.matches?.(".viewer--home .viewer-image")) syncHomePagingCues();
}, true);

app.addEventListener("animationend", (event) => {
  if (event.target.matches?.(".viewer--home .viewer-image")) syncHomePagingCues();
});

app.addEventListener("wheel", (event) => {
  const lightbox = event.target.closest(".lightbox");
  if (!lightbox || lightbox.hidden || lightboxLocked || event.target.closest(".lightbox-close")) return;
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0015);
  zoomLightboxAt(lightboxScale * factor, event.clientX, event.clientY);
}, { passive: false });

app.addEventListener("pointerdown", (event) => {
  const lightbox = event.target.closest(".lightbox");
  if (!lightbox || lightbox.hidden || event.target.closest(".lightbox-close")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  lightboxPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  event.target.setPointerCapture?.(event.pointerId);
  lightboxGestureMoved = false;
  lightboxSwipeTriggered = false;

  if (lightboxPointers.size === 1) {
    lightboxDragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: lightboxPanX,
      panY: lightboxPanY,
    };
    lightbox.classList.toggle("is-dragging", lightboxScale > 1);
  } else if (lightboxPointers.size === 2 && !lightboxLocked) {
    const [first, second] = [...lightboxPointers.values()];
    lightboxPinchStart = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
      scale: lightboxScale,
      panX: lightboxPanX,
      panY: lightboxPanY,
    };
    lightbox.classList.add("is-dragging");
  }
});

app.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".viewer-stage") || event.target.closest(".lightbox")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  viewerGestureMoved = false;
  viewerSwipeTriggered = false;
  viewerPointerStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
  event.target.setPointerCapture?.(event.pointerId);
});

app.addEventListener("pointermove", (event) => {
  if (!lightboxPointers.has(event.pointerId)) return;
  lightboxPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (!lightboxLocked && lightboxPointers.size >= 2 && lightboxPinchStart) {
    event.preventDefault();
    const [first, second] = [...lightboxPointers.values()];
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    const nextScale = Math.max(1, Math.min(5, lightboxPinchStart.scale * distance / Math.max(1, lightboxPinchStart.distance)));
    const stage = app.querySelector(".lightbox:not([hidden]) .lightbox-stage");
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const stageCenterX = stageRect.left + stageRect.width / 2;
    const stageCenterY = stageRect.top + stageRect.height / 2;
    const ratio = nextScale / lightboxPinchStart.scale;
    applyLightboxTransform(
      nextScale,
      lightboxPinchStart.panX + (centerX - lightboxPinchStart.centerX)
        + (lightboxPinchStart.centerX - stageCenterX - lightboxPinchStart.panX) * (1 - ratio),
      lightboxPinchStart.panY + (centerY - lightboxPinchStart.centerY)
        + (lightboxPinchStart.centerY - stageCenterY - lightboxPinchStart.panY) * (1 - ratio),
    );
    if (Math.abs(distance - lightboxPinchStart.distance) > 4) lightboxGestureMoved = true;
    return;
  }

  if (!lightboxDragStart || lightboxDragStart.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - lightboxDragStart.x;
  const deltaY = event.clientY - lightboxDragStart.y;
  if (
    lightboxScale === 1
    && lightboxPointers.size === 1
    && !lightboxSwipeTriggered
    && Math.abs(deltaX) > 24
    && Math.abs(deltaX) > Math.abs(deltaY) * 1.1
  ) {
    event.preventDefault();
    lightboxGestureMoved = true;
    lightboxSwipeTriggered = true;
    moveLightbox(deltaX < 0 ? 1 : -1);
    return;
  }
  if (!lightboxLocked && lightboxScale > 1) {
    if (Math.hypot(deltaX, deltaY) > 6) lightboxGestureMoved = true;
    event.preventDefault();
    applyLightboxTransform(
      lightboxScale,
      lightboxDragStart.panX + deltaX,
      lightboxDragStart.panY + deltaY,
    );
  }
});

app.addEventListener("pointermove", (event) => {
  if (!viewerPointerStart || viewerPointerStart.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - viewerPointerStart.x;
  const deltaY = event.clientY - viewerPointerStart.y;
  if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
    event.preventDefault();
  }
  if (
    !viewerSwipeTriggered
    && Math.abs(deltaX) > 24
    && Math.abs(deltaX) > Math.abs(deltaY) * 1.1
  ) {
    viewerGestureMoved = true;
    viewerSwipeTriggered = true;
    moveCurrent(deltaX < 0 ? 1 : -1);
  }
});

function finishLightboxPointer(event, allowSwipe) {
  const point = lightboxPointers.get(event.pointerId);
  const drag = lightboxDragStart?.pointerId === event.pointerId ? lightboxDragStart : null;
  lightboxPointers.delete(event.pointerId);

  if (allowSwipe && !lightboxSwipeTriggered && point && drag && lightboxScale === 1) {
    const deltaX = point.x - drag.x;
    const deltaY = point.y - drag.y;
    if (Math.abs(deltaX) > 36 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
      lightboxGestureMoved = true;
      moveLightbox(deltaX < 0 ? 1 : -1);
    }
  }

  if (lightboxPointers.size === 1) {
    const [pointerId, remaining] = [...lightboxPointers.entries()][0];
    lightboxDragStart = {
      pointerId,
      x: remaining.x,
      y: remaining.y,
      panX: lightboxPanX,
      panY: lightboxPanY,
    };
    lightboxPinchStart = null;
  } else if (lightboxPointers.size === 0) {
    lightboxDragStart = null;
    lightboxPinchStart = null;
    app.querySelector(".lightbox")?.classList.remove("is-dragging");
    window.setTimeout(() => { lightboxGestureMoved = false; }, 0);
  }
}

app.addEventListener("pointerup", (event) => finishLightboxPointer(event, true));
app.addEventListener("pointercancel", (event) => finishLightboxPointer(event, false));

app.addEventListener("pointerup", (event) => {
  if (!viewerPointerStart || viewerPointerStart.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - viewerPointerStart.x;
  const deltaY = event.clientY - viewerPointerStart.y;
  viewerPointerStart = null;
  if (!viewerSwipeTriggered && Math.abs(deltaX) > 36 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
    viewerGestureMoved = true;
    moveCurrent(deltaX < 0 ? 1 : -1);
  }
  window.setTimeout(() => { viewerGestureMoved = false; }, 0);
});

app.addEventListener("pointercancel", (event) => {
  if (viewerPointerStart?.pointerId === event.pointerId) viewerPointerStart = null;
});

brand.addEventListener("click", () => {
  if (!window.location.hash) {
    homeIndex = 0;
    renderLanding();
  }
});

window.addEventListener("hashchange", render);
window.addEventListener("resize", syncHomePagingCues);
document.addEventListener("fullscreenchange", syncFullscreenControls);
window.addEventListener("storage", (event) => {
  if (event.key !== preferenceKey) return;
  projects = applyPreferences(sourceProjects);
  render();
});
window.addEventListener("keydown", (event) => {
  const lightbox = app.querySelector(".lightbox");
  if (lightbox && !lightbox.hidden) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveLightbox(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveLightbox(1);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
    }
    return;
  }
  if (event.key === "ArrowLeft" && ["landing", "project"].includes(route().view)) {
    event.preventDefault();
    moveCurrent(-1);
  }
  if (event.key === "ArrowRight" && ["landing", "project"].includes(route().view)) {
    event.preventDefault();
    moveCurrent(1);
  }
  if (event.key === "Escape" && route().view === "project" && !isFullscreen()) {
    window.location.hash = cityHref(activeCity).slice(1);
  }
});

Promise.all([
  fetch("assets/portfolio-data-v2.json?v=20260807-34"),
  fetch("assets/portfolio-preferences.json?v=20260807-34"),
  fetch("assets/about-gallery.json?v=20260807-34"),
  fetch("assets/project-essays.json?v=20260807-34"),
  fetch("assets/project-equipment.json?v=20260807-34"),
])
  .then(async ([dataResponse, preferencesResponse, aboutResponse, essaysResponse, equipmentResponse]) => {
    if (!dataResponse.ok) throw new Error(`Portfolio data returned ${dataResponse.status}`);
    if (!preferencesResponse.ok) throw new Error(`Portfolio preferences returned ${preferencesResponse.status}`);
    if (!aboutResponse.ok) throw new Error(`About gallery returned ${aboutResponse.status}`);
    if (!essaysResponse.ok) throw new Error(`Project essays returned ${essaysResponse.status}`);
    if (!equipmentResponse.ok) throw new Error(`Project equipment returned ${equipmentResponse.status}`);
    return [
      await dataResponse.json(),
      await preferencesResponse.json(),
      await aboutResponse.json(),
      await essaysResponse.json(),
      await equipmentResponse.json(),
    ];
  })
  .then(([data, preferences, photography, essays, equipment]) => {
    const enrichedData = data.map((project) => ({
      ...project,
      description: essays[project.slug] || project.description,
      camera: equipment[project.slug]?.camera || "Not specified",
      focalLength: equipment[project.slug]?.focalLength || "Not specified",
    }));
    publishedPreferences = preferences;
    sourceProjects = enrichedData;
    projects = applyPreferences(enrichedData);
    aboutPhotos = photography;
    render();
  })
  .catch((error) => {
    console.error(error);
    app.innerHTML = `
      <section class="error-state" role="alert">
        <p>The project archive could not be loaded. Please start the local web server and refresh the page.</p>
      </section>`;
  });

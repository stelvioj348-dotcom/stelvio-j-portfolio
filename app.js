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
let touchStartX = null;
let transitionLocked = false;
let lightboxIndex = 0;
let lightboxLocked = false;
let lightboxTouchStartX = null;
let lightboxReturnFocus = null;
const imageDecodeCache = new Map();

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const pad = (value) => String(value).padStart(2, "0");

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
    <button class="viewer-arrow viewer-arrow--previous" type="button" data-action="${previousAction}" aria-label="${escapeHtml(previousLabel)}">
      <span aria-hidden="true">←</span>
    </button>
    <button class="viewer-arrow viewer-arrow--next" type="button" data-action="${nextAction}" aria-label="${escapeHtml(nextLabel)}">
      <span aria-hidden="true">→</span>
    </button>`;
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
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    console.error("Fullscreen could not be changed.", error);
  }
}

function renderLanding() {
  homeIndex = ((homeIndex % projects.length) + projects.length) % projects.length;
  const project = projects[homeIndex];
  const previous = projects[(homeIndex - 1 + projects.length) % projects.length];
  const next = projects[(homeIndex + 1) % projects.length];

  document.body.dataset.view = "landing";
  document.title = `${project.title} — Stelvio J`;
  renderNav();

  app.innerHTML = `
    <section class="viewer viewer--home is-${direction}" aria-labelledby="project-title">
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
            <dd>${escapeHtml(project.architect)}</dd>
            <dt>City</dt>
            <dd>${escapeHtml(project.city)}</dd>
            <dt>Photographed</dt>
            <dd>${escapeHtml(project.shootingDate)}</dd>
          </dl>
          <p class="project-description">${escapeHtml(project.description)}</p>
          <div class="viewer-caption-footer">
            <a class="view-project" href="#projects">Projects</a>
            <span class="viewer-tools">
              <span class="viewer-counter" aria-live="polite">${pad(homeIndex + 1)} / ${pad(projects.length)}</span>
              ${fullscreenControl()}
            </span>
          </div>
        </aside>
        ${viewerButtons(`Previous project: ${previous.title}`, `Next project: ${next.title}`, "home-previous", "home-next")}
      </div>
    </section>`;

  preload([previous.coverSrc, next.coverSrc]);
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
        <article class="archive-card" style="--span:${project.span};--order:${order}" data-span="${project.span}">
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
    </section>`;
}

function aboutPhotoFrame(photo, index, className = "") {
  const alt = `28mm Within — ${photo.category} photograph ${index + 1}`;
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
    <div class="lightbox" hidden role="dialog" aria-modal="true" aria-labelledby="lightbox-title">
      <h2 class="visually-hidden" id="lightbox-title">28mm Within photograph viewer</h2>
      <div class="lightbox-backdrop" data-action="close-lightbox"></div>
      <div class="lightbox-shell">
        <button class="lightbox-close" type="button" data-action="close-lightbox">Close</button>
        <div class="lightbox-stage" aria-live="polite"></div>
        <button class="lightbox-arrow lightbox-arrow--previous" type="button" data-action="lightbox-previous" aria-label="Previous photograph"><span aria-hidden="true">&larr;</span></button>
        <button class="lightbox-arrow lightbox-arrow--next" type="button" data-action="lightbox-next" aria-label="Next photograph"><span aria-hidden="true">&rarr;</span></button>
        <div class="lightbox-meta">
          <span class="lightbox-category"></span>
          <span class="lightbox-counter"></span>
        </div>
      </div>
    </div>`;
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
        <h1 id="contact-title">Jiang Ruiqi</h1>
        <p class="profile-statement">For architecture, photography, and other enquiries.</p>
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

function updateLightboxMeta() {
  const photo = aboutPhotos[lightboxIndex];
  const lightbox = app.querySelector(".lightbox");
  if (!photo || !lightbox) return;
  const category = lightbox.querySelector(".lightbox-category");
  const counter = lightbox.querySelector(".lightbox-counter");
  if (category) category.textContent = `28mm Within / ${photo.category}`;
  if (counter) counter.textContent = `${pad(lightboxIndex + 1)} / ${pad(aboutPhotos.length)}`;
}

function preloadLightboxNeighbors() {
  if (!aboutPhotos.length) return;
  const previous = aboutPhotos[(lightboxIndex - 1 + aboutPhotos.length) % aboutPhotos.length];
  const next = aboutPhotos[(lightboxIndex + 1) % aboutPhotos.length];
  preload([previous.full, next.full]);
}

async function openLightbox(index) {
  const lightbox = app.querySelector(".lightbox");
  if (!lightbox || !aboutPhotos.length) return;
  lightboxIndex = ((Number(index) % aboutPhotos.length) + aboutPhotos.length) % aboutPhotos.length;
  lightboxReturnFocus = document.activeElement;
  lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  lightbox.querySelector(".lightbox-stage").innerHTML = '<p class="lightbox-loading" role="status">Loading photograph…</p>';
  updateLightboxMeta();
  requestAnimationFrame(() => lightbox.classList.add("is-open"));
  lightbox.querySelector(".lightbox-close")?.focus({ preventScroll: true });

  const photo = aboutPhotos[lightboxIndex];
  await prepareImage(photo.full);
  if (lightbox.hidden) return;
  lightbox.querySelector(".lightbox-stage").innerHTML = aboutPhotoFrame(photo, lightboxIndex);
  preloadLightboxNeighbors();
}

function closeLightbox() {
  const lightbox = app.querySelector(".lightbox");
  if (!lightbox || lightbox.hidden) return;
  lightbox.classList.remove("is-open");
  lightbox.hidden = true;
  lightboxLocked = false;
  document.body.classList.remove("lightbox-open");
  lightboxReturnFocus?.focus?.({ preventScroll: true });
  lightboxReturnFocus = null;
}

async function moveLightbox(step) {
  const lightbox = app.querySelector(".lightbox");
  if (!lightbox || lightbox.hidden || lightboxLocked || !aboutPhotos.length) return;
  const nextIndex = (lightboxIndex + step + aboutPhotos.length) % aboutPhotos.length;
  const nextPhoto = aboutPhotos[nextIndex];
  const stage = lightbox.querySelector(".lightbox-stage");
  const outgoing = stage?.querySelector(".lightbox-frame");
  if (!stage || !outgoing) return;

  lightboxLocked = true;
  await prepareImage(nextPhoto.full);
  if (lightbox.hidden) {
    lightboxLocked = false;
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    stage.innerHTML = aboutPhotoFrame(nextPhoto, nextIndex);
    lightboxIndex = nextIndex;
    updateLightboxMeta();
    preloadLightboxNeighbors();
    lightboxLocked = false;
    return;
  }

  const moveDirection = step > 0 ? "next" : "previous";
  const template = document.createElement("template");
  template.innerHTML = aboutPhotoFrame(nextPhoto, nextIndex, `lightbox-frame--incoming is-${moveDirection}`).trim();
  const incoming = template.content.firstElementChild;
  outgoing.classList.add("lightbox-frame--outgoing", `is-${moveDirection}`);
  stage.classList.add("lightbox-stage--moving");
  stage.append(incoming);
  incoming.getBoundingClientRect();
  stage.classList.add("lightbox-stage--active");

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    outgoing.remove();
    incoming.className = "lightbox-frame";
    stage.classList.remove("lightbox-stage--moving", "lightbox-stage--active");
    lightboxIndex = nextIndex;
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
  photoIndex = ((photoIndex % project.images.length) + project.images.length) % project.images.length;

  const image = project.images[photoIndex];
  const previous = project.images[(photoIndex - 1 + project.images.length) % project.images.length];
  const next = project.images[(photoIndex + 1) % project.images.length];
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
            <dd>${escapeHtml(project.architect)}</dd>
            <dt>City</dt>
            <dd>${escapeHtml(project.city)}</dd>
            <dt>Photographed</dt>
            <dd>${escapeHtml(project.shootingDate)}</dd>
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
    </article>`;

  preload([previous.src, next.src]);
  syncFullscreenControls();
}

async function runCarouselTransition(step, update, incomingSrc) {
  if (transitionLocked) return;
  transitionLocked = true;
  direction = step > 0 ? "next" : "previous";
  await prepareImage(incomingSrc);
  const outgoing = app.querySelector(".viewer-stage")?.cloneNode(true);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!outgoing || reduceMotion) {
    update();
    transitionLocked = false;
    return;
  }

  update();
  const viewer = app.querySelector(".viewer");
  const incoming = viewer?.querySelector(".viewer-stage");
  if (!viewer || !incoming) {
    transitionLocked = false;
    return;
  }

  viewer.classList.add("carousel-transition");
  incoming.classList.add("carousel-layer", "carousel-incoming", `carousel-${direction}`);
  outgoing.classList.add("carousel-layer", "carousel-outgoing", `carousel-${direction}`);
  outgoing.setAttribute("aria-hidden", "true");
  viewer.append(outgoing);

  incoming.getBoundingClientRect();
  viewer.classList.add("carousel-active");

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    incoming.classList.add("carousel-settled");
    outgoing.remove();
    incoming.classList.remove("carousel-layer", "carousel-incoming", `carousel-${direction}`);
    viewer.classList.remove("carousel-transition", "carousel-active");
    transitionLocked = false;
  };
  incoming.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 1650);
}

function moveHome(step) {
  const nextIndex = (homeIndex + step + projects.length) % projects.length;
  runCarouselTransition(step, () => {
    homeIndex = (homeIndex + step + projects.length) % projects.length;
    renderLanding();
  }, projects[nextIndex].coverSrc);
}

async function movePhoto(step) {
  if (transitionLocked) return;
  const project = projects.find((item) => item.slug === route().value);
  if (!project?.images.length) return;
  const nextIndex = (photoIndex + step + project.images.length) % project.images.length;
  const nextImage = project.images[nextIndex];
  const media = app.querySelector(".viewer--project .viewer-media");
  const outgoing = media?.querySelector(".viewer-image-frame");
  if (!media || !outgoing) return;

  transitionLocked = true;
  direction = step > 0 ? "next" : "previous";
  await prepareImage(nextImage.src);

  if (route().view !== "project" || route().value !== project.slug) {
    transitionLocked = false;
    return;
  }

  const incomingTemplate = document.createElement("template");
  incomingTemplate.innerHTML = projectImageFrame(nextImage).trim();
  const incoming = incomingTemplate.content.firstElementChild;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const finish = () => {
    incoming.classList.add("carousel-settled");
    outgoing.remove();
    incoming.classList.remove("media-carousel-layer", "media-carousel-incoming", `carousel-${direction}`);
    media.classList.remove("media-carousel-transition", "media-carousel-active");
    photoIndex = nextIndex;
    const counter = app.querySelector(".viewer-counter");
    if (counter) counter.textContent = `${pad(photoIndex + 1)} / ${pad(project.images.length)}`;
    const previous = project.images[(photoIndex - 1 + project.images.length) % project.images.length];
    const next = project.images[(photoIndex + 1) % project.images.length];
    preload([previous.src, next.src]);
    transitionLocked = false;
  };

  if (reduceMotion) {
    media.replaceChildren(incoming);
    photoIndex = nextIndex;
    const counter = app.querySelector(".viewer-counter");
    if (counter) counter.textContent = `${pad(photoIndex + 1)} / ${pad(project.images.length)}`;
    preload([
      project.images[(photoIndex - 1 + project.images.length) % project.images.length].src,
      project.images[(photoIndex + 1) % project.images.length].src,
    ]);
    transitionLocked = false;
    return;
  }

  outgoing.classList.add("media-carousel-layer", "media-carousel-outgoing", `carousel-${direction}`);
  incoming.classList.add("media-carousel-layer", "media-carousel-incoming", `carousel-${direction}`);
  outgoing.setAttribute("aria-hidden", "true");
  media.classList.add("media-carousel-transition");
  media.append(incoming);
  incoming.getBoundingClientRect();
  media.classList.add("media-carousel-active");

  let finished = false;
  const finishOnce = () => {
    if (finished) return;
    finished = true;
    finish();
  };
  incoming.addEventListener("transitionend", finishOnce, { once: true });
  window.setTimeout(finishOnce, 1650);
}

function moveCurrent(step) {
  const current = route();
  if (current.view === "project") movePhoto(step);
  if (current.view === "landing") moveHome(step);
}

function render() {
  if (!projects.length) return;
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
  actions[control.dataset.action]?.();
});

app.addEventListener("touchstart", (event) => {
  lightboxTouchStartX = event.target.closest(".lightbox-stage")
    ? event.changedTouches[0]?.clientX ?? null
    : null;
  touchStartX = event.target.closest(".viewer-media")
    ? event.changedTouches[0]?.clientX ?? null
    : null;
}, { passive: true });

app.addEventListener("touchend", (event) => {
  if (lightboxTouchStartX !== null) {
    const lightboxDistance = (event.changedTouches[0]?.clientX ?? lightboxTouchStartX) - lightboxTouchStartX;
    lightboxTouchStartX = null;
    if (Math.abs(lightboxDistance) > 48) moveLightbox(lightboxDistance < 0 ? 1 : -1);
    return;
  }
  if (touchStartX === null) return;
  const distance = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
  touchStartX = null;
  if (Math.abs(distance) > 48) moveCurrent(distance < 0 ? 1 : -1);
}, { passive: true });

brand.addEventListener("click", () => {
  if (!window.location.hash) {
    homeIndex = 0;
    renderLanding();
  }
});

window.addEventListener("hashchange", render);
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
  fetch("assets/portfolio-data-v2.json?v=20260807-15"),
  fetch("assets/portfolio-preferences.json?v=20260807-15"),
  fetch("assets/about-gallery.json?v=20260807-15"),
])
  .then(async ([dataResponse, preferencesResponse, aboutResponse]) => {
    if (!dataResponse.ok) throw new Error(`Portfolio data returned ${dataResponse.status}`);
    if (!preferencesResponse.ok) throw new Error(`Portfolio preferences returned ${preferencesResponse.status}`);
    if (!aboutResponse.ok) throw new Error(`About gallery returned ${aboutResponse.status}`);
    return [await dataResponse.json(), await preferencesResponse.json(), await aboutResponse.json()];
  })
  .then(([data, preferences, photography]) => {
    publishedPreferences = preferences;
    sourceProjects = data;
    projects = applyPreferences(data);
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

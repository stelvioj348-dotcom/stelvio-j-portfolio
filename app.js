const app = document.querySelector("#app");
const cityNav = document.querySelector("#city-nav");
const brand = document.querySelector(".brand");
const preferenceKey = "stelvio-portfolio-preferences-v1";

let sourceProjects = [];
let projects = [];
let publishedPreferences = {};
let homeIndex = 0;
let photoIndex = 0;
let activeCity = "All";
let activeProjectSlug = "";
let direction = "next";
let touchStartX = null;
let transitionLocked = false;
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
            <h2>${escapeHtml(project.title)}</h2>
          </a>
        </article>`,
    )
    .join("");

  app.innerHTML = `
    <section class="archive-view" aria-labelledby="archive-title">
      <header class="archive-toolbar">
        <h1 id="archive-title">${escapeHtml(normalizedCity === "All" ? "Projects" : normalizedCity)}</h1>
        <span>${pad(visible.length)} projects</span>
        <a href="editor.html">Edit covers & order</a>
      </header>
      <div class="archive-grid">${cards}</div>
    </section>`;
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
  window.setTimeout(finish, 620);
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
  window.setTimeout(finishOnce, 620);
}

function moveCurrent(step) {
  const current = route();
  if (current.view === "project") movePhoto(step);
  if (current.view === "landing") moveHome(step);
}

function render() {
  if (!projects.length) return;
  const current = route();
  direction = "next";
  if (current.view === "project") renderProject(current.value);
  else if (current.view === "archive") renderArchive(current.value);
  else renderLanding();
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
  };
  actions[control.dataset.action]?.();
});

app.addEventListener("touchstart", (event) => {
  touchStartX = event.target.closest(".viewer-media")
    ? event.changedTouches[0]?.clientX ?? null
    : null;
}, { passive: true });

app.addEventListener("touchend", (event) => {
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
  if (event.key === "ArrowLeft" && route().view !== "archive") {
    event.preventDefault();
    moveCurrent(-1);
  }
  if (event.key === "ArrowRight" && route().view !== "archive") {
    event.preventDefault();
    moveCurrent(1);
  }
  if (event.key === "Escape" && route().view === "project" && !isFullscreen()) {
    window.location.hash = cityHref(activeCity).slice(1);
  }
});

Promise.all([
  fetch("assets/portfolio-data-v2.json?v=20260807-5"),
  fetch("assets/portfolio-preferences.json?v=20260807-5"),
])
  .then(async ([dataResponse, preferencesResponse]) => {
    if (!dataResponse.ok) throw new Error(`Portfolio data returned ${dataResponse.status}`);
    if (!preferencesResponse.ok) throw new Error(`Portfolio preferences returned ${preferencesResponse.status}`);
    return [await dataResponse.json(), await preferencesResponse.json()];
  })
  .then(([data, preferences]) => {
    publishedPreferences = preferences;
    sourceProjects = data;
    projects = applyPreferences(data);
    render();
  })
  .catch((error) => {
    console.error(error);
    app.innerHTML = `
      <section class="error-state" role="alert">
        <p>The project archive could not be loaded. Please start the local web server and refresh the page.</p>
      </section>`;
  });

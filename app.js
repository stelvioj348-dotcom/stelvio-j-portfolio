const app = document.querySelector("#app");
const cityNav = document.querySelector("#city-nav");
const brand = document.querySelector(".brand");

let projects = [];
let homeIndex = 0;
let photoIndex = 0;
let activeCity = "All";
let activeProjectSlug = "";
let direction = "next";
let touchStartX = null;

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const pad = (value) => String(value).padStart(2, "0");

const route = () => {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw.startsWith("project/")) {
    return { view: "project", value: decodeURIComponent(raw.slice(8)) };
  }
  if (raw.startsWith("city/")) {
    return { view: "home", value: decodeURIComponent(raw.slice(5)) };
  }
  return { view: "home", value: "All" };
};

const cityHref = (city) => (city === "All" ? "#" : `#city/${encodeURIComponent(city)}`);

function visibleProjects(city = activeCity) {
  return city === "All" ? projects : projects.filter((project) => project.city === city);
}

function renderNav(currentCity = "All") {
  const cities = ["All", ...new Set(projects.map((project) => project.city))].sort((a, b) => {
    if (a === "All") return -1;
    if (b === "All") return 1;
    return a.localeCompare(b, "en");
  });

  cityNav.innerHTML = cities
    .map(
      (city) =>
        `<a href="${cityHref(city)}" ${city === currentCity ? 'aria-current="page"' : ""}>${escapeHtml(city)}</a>`,
    )
    .join("");
}

function preload(sources) {
  sources.filter(Boolean).forEach((src) => {
    const image = new Image();
    image.src = src;
  });
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

function renderHome(city = "All") {
  const normalizedCity = projects.some((project) => project.city === city) ? city : "All";
  if (normalizedCity !== activeCity) homeIndex = 0;
  activeCity = normalizedCity;

  const visible = visibleProjects();
  homeIndex = ((homeIndex % visible.length) + visible.length) % visible.length;
  const project = visible[homeIndex];
  const previous = visible[(homeIndex - 1 + visible.length) % visible.length];
  const next = visible[(homeIndex + 1) % visible.length];

  document.title = `${project.title} — Stelvio J`;
  renderNav(activeCity);

  app.innerHTML = `
    <section class="viewer viewer--home is-${direction}" aria-labelledby="project-title">
      <div class="viewer-stage">
        <a class="viewer-media viewer-media--link" href="#project/${encodeURIComponent(project.slug)}" aria-label="View ${escapeHtml(project.title)}">
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
          <h1 id="project-title"><a href="#project/${encodeURIComponent(project.slug)}">${escapeHtml(project.title)}</a></h1>
          <dl class="project-meta">
            <dt>Architect</dt>
            <dd>${escapeHtml(project.architect)}</dd>
            <dt>City</dt>
            <dd>${escapeHtml(project.city)}</dd>
          </dl>
          <p class="project-description">${escapeHtml(project.description)}</p>
          <div class="viewer-caption-footer">
            <a class="view-project" href="#project/${encodeURIComponent(project.slug)}">View project</a>
            <span class="viewer-counter" aria-live="polite">${pad(homeIndex + 1)} / ${pad(visible.length)}</span>
          </div>
        </aside>
        ${viewerButtons(`Previous project: ${previous.title}`, `Next project: ${next.title}`, "home-previous", "home-next")}
      </div>
    </section>`;

  preload([previous.coverSrc, next.coverSrc]);
}

function renderProject(slug) {
  const project = projects.find((item) => item.slug === slug);
  if (!project) {
    window.location.hash = "";
    return;
  }

  if (activeProjectSlug !== slug) photoIndex = 0;
  activeProjectSlug = slug;
  photoIndex = ((photoIndex % project.images.length) + project.images.length) % project.images.length;

  const image = project.images[photoIndex];
  const previous = project.images[(photoIndex - 1 + project.images.length) % project.images.length];
  const next = project.images[(photoIndex + 1) % project.images.length];
  document.title = `${project.title} — Stelvio J`;
  renderNav(project.city);

  app.innerHTML = `
    <article class="viewer viewer--project is-${direction}" aria-labelledby="project-title">
      <div class="viewer-stage">
        <figure class="viewer-media">
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
        </figure>
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
            <span class="viewer-counter" aria-live="polite">${pad(photoIndex + 1)} / ${pad(project.images.length)}</span>
          </div>
        </aside>
        ${viewerButtons("Previous photograph", "Next photograph", "photo-previous", "photo-next")}
      </div>
    </article>`;

  preload([previous.src, next.src]);
}

function moveHome(step) {
  const visible = visibleProjects();
  if (!visible.length) return;
  direction = step > 0 ? "next" : "previous";
  homeIndex = (homeIndex + step + visible.length) % visible.length;
  renderHome(activeCity);
}

function movePhoto(step) {
  const project = projects.find((item) => item.slug === route().value);
  if (!project?.images.length) return;
  direction = step > 0 ? "next" : "previous";
  photoIndex = (photoIndex + step + project.images.length) % project.images.length;
  renderProject(project.slug);
}

function moveCurrent(step) {
  if (route().view === "project") movePhoto(step);
  else moveHome(step);
}

function render() {
  if (!projects.length) return;
  const current = route();
  direction = "next";
  if (current.view === "project") renderProject(current.value);
  else renderHome(current.value);
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
  };
  actions[control.dataset.action]?.();
});

app.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0]?.clientX ?? null;
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
    renderHome("All");
  }
});

cityNav.addEventListener("click", () => {
  homeIndex = 0;
});

window.addEventListener("hashchange", render);
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveCurrent(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveCurrent(1);
  }
  if (event.key === "Escape" && route().view === "project") {
    window.location.hash = cityHref(activeCity).slice(1);
  }
});

fetch("assets/portfolio-data.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Portfolio data returned ${response.status}`);
    return response.json();
  })
  .then((data) => {
    projects = data;
    render();
  })
  .catch((error) => {
    console.error(error);
    app.innerHTML = `
      <section class="error-state" role="alert">
        <p>The project archive could not be loaded. Please start the local web server and refresh the page.</p>
      </section>`;
  });

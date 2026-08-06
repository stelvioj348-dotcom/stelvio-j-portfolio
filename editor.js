const preferenceKey = "stelvio-portfolio-preferences-v1";
const grid = document.querySelector("#editor-grid");
const dialog = document.querySelector("#cover-dialog");
const dialogTitle = document.querySelector("#cover-dialog-title");
const coverOptions = document.querySelector("#cover-options");
const status = document.querySelector("#editor-status");

let projects = [];
let order = [];
let covers = {};
let draggedSlug = "";
let activeCoverSlug = "";

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

function exportChoices() {
  return { version: 1, order, covers };
}

function save(message = "Changes saved in this browser.") {
  localStorage.setItem(preferenceKey, JSON.stringify(exportChoices()));
  status.textContent = message;
}

function orderedProjects() {
  const bySlug = new Map(projects.map((project) => [project.slug, project]));
  const result = [];
  order.forEach((slug) => {
    const project = bySlug.get(slug);
    if (project) {
      result.push(project);
      bySlug.delete(slug);
    }
  });
  result.push(...bySlug.values());
  return result;
}

function selectedCover(project) {
  const selected = project.images.find((image) => image.src === covers[project.slug]);
  return selected || {
    src: project.coverSrc,
    width: project.coverWidth,
    height: project.coverHeight,
    label: "Current cover",
  };
}

function applyPreferenceSet(data, preferences = {}) {
  const bySlug = new Map(data.map((project) => [project.slug, project]));
  const arranged = [];
  (preferences.order || []).forEach((slug) => {
    const project = bySlug.get(slug);
    if (project) {
      arranged.push(project);
      bySlug.delete(slug);
    }
  });
  arranged.push(...bySlug.values());
  return arranged.map((project) => {
    const selected = project.images.find((image) => image.src === preferences.covers?.[project.slug]);
    return selected
      ? { ...project, coverSrc: selected.src, coverWidth: selected.width, coverHeight: selected.height }
      : project;
  });
}

function coverLabel(project) {
  const index = project.images.findIndex((image) => image.src === covers[project.slug]);
  return index === -1 ? "Current cover" : `Photograph ${pad(index + 1)}`;
}

function render() {
  const arranged = orderedProjects();
  order = arranged.map((project) => project.slug);
  grid.innerHTML = arranged
    .map((project, index) => {
      const cover = selectedCover(project);
      return `
        <article class="editor-project" draggable="true" data-slug="${escapeHtml(project.slug)}" tabindex="0">
          <figure class="project-cover" aria-label="Drag ${escapeHtml(project.title)} to change its position">
            <img src="${cover.src}" width="${cover.width}" height="${cover.height}" alt="${escapeHtml(project.title)} selected cover" loading="lazy" decoding="async" />
            <span class="order-number">${pad(index + 1)}</span>
          </figure>
          <h2>${escapeHtml(project.title)}</h2>
          <p class="cover-label">${coverLabel(project)}</p>
          <div class="project-actions">
            <button type="button" data-action="choose-cover">Choose cover</button>
            <button type="button" data-action="move-up" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(project.title)} earlier">↑ Earlier</button>
            <button type="button" data-action="move-down" ${index === arranged.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(project.title)} later">↓ Later</button>
          </div>
        </article>`;
    })
    .join("");
}

function move(slug, offset) {
  const index = order.indexOf(slug);
  const destination = Math.max(0, Math.min(order.length - 1, index + offset));
  if (index < 0 || index === destination) return;
  order.splice(index, 1);
  order.splice(destination, 0, slug);
  save();
  render();
  grid.querySelector(`[data-slug="${CSS.escape(slug)}"]`)?.focus();
}

function openCoverChooser(slug) {
  const project = projects.find((item) => item.slug === slug);
  if (!project) return;
  activeCoverSlug = slug;
  dialogTitle.textContent = project.title;
  const currentSelected = covers[slug] || "";
  const options = [
    {
      src: project.coverSrc,
      width: project.coverWidth,
      height: project.coverHeight,
      value: "",
      label: "Current cover",
    },
    ...project.images.map((image, index) => ({
      ...image,
      value: image.src,
      label: `Photograph ${pad(index + 1)}`,
    })),
  ];
  coverOptions.innerHTML = options
    .map(
      (image) => `
        <button class="cover-option" type="button" data-cover-src="${escapeHtml(image.value)}" aria-pressed="${image.value === currentSelected}">
          <figure><img src="${image.src}" width="${image.width}" height="${image.height}" alt="${escapeHtml(project.title)} — ${escapeHtml(image.label)}" loading="lazy" decoding="async" /></figure>
          <span>${escapeHtml(image.label)}</span>
        </button>`,
    )
    .join("");
  dialog.showModal();
}

grid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  const card = event.target.closest(".editor-project");
  if (!button || !card) return;
  if (button.dataset.action === "choose-cover") openCoverChooser(card.dataset.slug);
  if (button.dataset.action === "move-up") move(card.dataset.slug, -1);
  if (button.dataset.action === "move-down") move(card.dataset.slug, 1);
});

grid.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".editor-project");
  if (!card) return;
  draggedSlug = card.dataset.slug;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedSlug);
});

grid.addEventListener("dragend", () => {
  draggedSlug = "";
  grid.querySelectorAll(".editor-project").forEach((card) => card.classList.remove("is-dragging", "is-drop-target"));
});

grid.addEventListener("dragover", (event) => {
  const card = event.target.closest(".editor-project");
  if (!card || card.dataset.slug === draggedSlug) return;
  event.preventDefault();
  grid.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  card.classList.add("is-drop-target");
});

grid.addEventListener("drop", (event) => {
  const card = event.target.closest(".editor-project");
  if (!card || !draggedSlug || card.dataset.slug === draggedSlug) return;
  event.preventDefault();
  const from = order.indexOf(draggedSlug);
  const to = order.indexOf(card.dataset.slug);
  order.splice(from, 1);
  order.splice(to, 0, draggedSlug);
  save();
  render();
});

coverOptions.addEventListener("click", (event) => {
  const option = event.target.closest("[data-cover-src]");
  if (!option || !activeCoverSlug) return;
  const value = option.dataset.coverSrc;
  if (value) covers[activeCoverSlug] = value;
  else delete covers[activeCoverSlug];
  save("Cover selected and saved in this browser.");
  dialog.close();
  render();
});

document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());

document.querySelector("#copy-choices").addEventListener("click", async () => {
  const text = JSON.stringify(exportChoices(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = "Choices copied. Paste them into your Codex conversation to publish.";
  } catch {
    status.textContent = "Copy was blocked. Use Download JSON instead.";
  }
});

document.querySelector("#download-choices").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(exportChoices(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "stelvio-j-portfolio-choices.json";
  link.click();
  URL.revokeObjectURL(url);
  status.textContent = "Choices downloaded as stelvio-j-portfolio-choices.json.";
});

document.querySelector("#reset-choices").addEventListener("click", () => {
  if (!window.confirm("Reset every cover and the full 35-project order on this device?")) return;
  localStorage.removeItem(preferenceKey);
  covers = {};
  order = projects.map((project) => project.slug);
  status.textContent = "Covers and order reset to the published defaults.";
  render();
});

Promise.all([
  fetch("assets/portfolio-data-v2.json?v=20260806-5"),
  fetch("assets/portfolio-preferences.json?v=20260806-5"),
])
  .then(async ([dataResponse, preferencesResponse]) => {
    if (!dataResponse.ok) throw new Error(`Portfolio data returned ${dataResponse.status}`);
    if (!preferencesResponse.ok) throw new Error(`Portfolio preferences returned ${preferencesResponse.status}`);
    return [await dataResponse.json(), await preferencesResponse.json()];
  })
  .then(([data, publishedPreferences]) => {
    projects = applyPreferenceSet(data, publishedPreferences);
    const preferences = readPreferences();
    const validSlugs = new Set(projects.map((project) => project.slug));
    order = (preferences.order || []).filter((slug) => validSlugs.has(slug));
    projects.forEach((project) => {
      if (!order.includes(project.slug)) order.push(project.slug);
    });
    covers = preferences.covers || {};
    render();
  })
  .catch((error) => {
    console.error(error);
    grid.innerHTML = "<p>The portfolio data could not be loaded.</p>";
  });

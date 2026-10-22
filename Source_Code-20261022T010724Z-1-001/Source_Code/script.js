const API_URL = "https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/master/PeriodicTableJSON.json";
const BACKUP_URL = "elements.json";

const CATEGORIES = {
  "alkali": { label: "Alkali metals", color: "#fdba74" }, "alkaline": { label: "Alkaline-earth metals", color: "#fcd34d" },
  "transition": { label: "Transition metals", color: "#c4b5fd" }, "post-transition": { label: "Other metals", color: "#f9a8d4" },
  "metalloid": { label: "Metalloids", color: "#5eead4" }, "nonmetal": { label: "Other nonmetals", color: "#fca5a5" },
  "halogen": { label: "Halogens", color: "#86efac" }, "noble gas": { label: "Noble gases", color: "#7dd3fc" },
  "lanthanide": { label: "Lanthanides", color: "#d9f99d" }, "actinide": { label: "Actinides", color: "#67e8f9" },
  "unknown": { label: "Unknown", color: "#e2e8f0" }
};
const CATEGORY_KEYS = ["noble gas", "alkaline", "alkali", "post-transition", "transition", "lanthanide", "actinide", "metalloid", "nonmetal"];
const HALOGENS = [9, 17, 35, 53, 85, 117];
const METALS = ["alkali", "alkaline", "transition", "post-transition", "lanthanide", "actinide"];
const NONMETALS = ["nonmetal", "halogen", "noble gas"];
const FILTERS = { all: () => true, metal: e => METALS.includes(e.category), nonmetal: e => NONMETALS.includes(e.category), "noble gas": e => e.category === "noble gas" };
["solid", "liquid", "gas"].forEach(state => FILTERS[state] = e => e.standardState === state);

let allElements = [], visibleElements = [], activeFilter = "all", searchText = "", colorMode = "category", currentElement = null;

const [grid, legend, statusMsg, retryBtn, searchForm, searchInput, clearBtn, modal, closeBtn, prevBtn, nextBtn, modalPic, modalImg] =
  ["elements-grid", "legend", "status", "retry-btn", "search-form", "search-input", "clear-btn", "modal", "close-btn", "prev-btn", "next-btn", "modal-pic", "modal-img"]
    .map(id => document.getElementById(id));
const filterButtons = document.querySelectorAll(".filter-btn");
const modeButtons = document.querySelectorAll(".mode-btn");

const isEmpty = v => v === null || v === undefined || v === "";
const capitalize = t => isEmpty(t) ? null : t.charAt(0).toUpperCase() + t.slice(1);
const brightness = hex => (parseInt(hex.slice(1, 3), 16) * 299 + parseInt(hex.slice(3, 5), 16) * 587 + parseInt(hex.slice(5, 7), 16) * 114) / 1000;

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showStatus(message, isError = false) {
  statusMsg.textContent = message;
  statusMsg.classList.toggle("error", isError);
}

function formatTemp(kelvin) {
  const number = Number(kelvin);
  return isEmpty(kelvin) || isNaN(number) ? null : `${number} K (${(number - 273.15).toFixed(1)} °C)`;
}

function getColor(el) {
  if (colorMode === "category") return CATEGORIES[el.category].color;
  if (isEmpty(el.cpkHexColor)) return "#94a3b8";
  const color = "#" + String(el.cpkHexColor).replace("#", "");
  return brightness(color) < 70 ? "#94a3b8" : color;
}

function getCategoryKey(number, text) {
  if (HALOGENS.includes(number)) return "halogen";
  const c = (text || "").toLowerCase();
  return CATEGORY_KEYS.find(key => c.includes(key)) || "unknown";
}

async function fetchElements(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Server responded with status " + response.status);
  const json = await response.json();
  const list = Array.isArray(json) ? json : json.elements;
  if (!Array.isArray(list)) throw new Error("Unexpected data format");
  return list.map(item => ({
    name: item.name, symbol: item.symbol, atomicNumber: item.number, atomicMass: item.atomic_mass,
    groupBlock: isEmpty(item.category) ? "" : item.category.trim().toLowerCase(),
    category: getCategoryKey(item.number, item.category),
    standardState: isEmpty(item.phase) ? "" : item.phase.trim().toLowerCase(),
    electronicConfiguration: item.electron_configuration, meltingPoint: item.melt, boilingPoint: item.boil,
    density: item.density, discoveredBy: item.discovered_by, cpkHexColor: item["cpk-hex"], summary: item.summary,
    photoUrl: item.image && item.image.url ? item.image.url : null, bohrUrl: item.bohr_model_image || null
  }));
}

async function loadElements() {
  showStatus("Loading elements...");
  retryBtn.classList.add("hidden");
  grid.innerHTML = "";
  try {
    let data;
    try { data = await fetchElements(API_URL); }
    catch (firstError) { console.warn("Main source failed, trying backup file...", firstError); data = await fetchElements(BACKUP_URL); }
    if (!Array.isArray(data) || data.length === 0) {
      showStatus("The server returned no element data.", true);
      retryBtn.classList.remove("hidden");
      return;
    }
    allElements = data.filter(el => el.atomicNumber >= 1 && el.atomicNumber <= 118).sort((a, b) => a.atomicNumber - b.atomicNumber);
    showStatus("");
    updateDisplay();
  } catch (error) {
    console.error(error);
    showStatus("Could not load the elements. Check your internet connection and try again.", true);
    retryBtn.classList.remove("hidden");
  }
}

function matchesSearch(el) {
  const text = searchText.trim().toLowerCase();
  return text === "" || (el.name || "").toLowerCase().includes(text) || (el.symbol || "").toLowerCase() === text || String(el.atomicNumber) === text;
}

function updateDisplay() {
  if (activeFilter === "all" && searchText.trim() === "") {
    visibleElements = allElements;
    renderPeriodicTable();
    showStatus("");
  } else {
    const results = allElements.filter(el => (FILTERS[activeFilter] || FILTERS.all)(el) && matchesSearch(el));
    visibleElements = results;
    grid.innerHTML = "";
    grid.className = "list-layout";
    results.forEach((el, i) => grid.appendChild(makeCard(el, i)));
    showStatus(results.length === 0 ? "No elements found. Try a different search or filter." : `Showing ${results.length} ${results.length === 1 ? "element" : "elements"}.`);
  }
  renderLegend();
}

function getPosition(n) {
  if (n === 1) return { col: 1, row: 2 };
  if (n === 2) return { col: 18, row: 2 };
  const [, shift, row] = [[4, -2, 3], [10, 8, 3], [12, -10, 4], [18, 0, 4], [36, -18, 5], [54, -36, 6], [56, -54, 7], [71, -54, 10], [86, -68, 7], [88, -86, 8], [103, -86, 11], [118, -100, 8]].find(r => n <= r[0]);
  return { col: n + shift, row };
}

function place(node, col, row) {
  node.style.gridColumn = col;
  node.style.gridRow = row;
  grid.appendChild(node);
}

function renderPeriodicTable() {
  grid.innerHTML = "";
  grid.className = "periodic";
  for (let g = 1; g <= 18; g++) place(make("div", "group-num", g), g, 1);
  allElements.forEach((el, i) => {
    const pos = getPosition(el.atomicNumber);
    place(makeCard(el, i), pos.col, pos.row);
  });
  [["57–71", "lanthanide", 7], ["89–103", "actinide", 8]].forEach(([text, key, row]) => {
    const box = make("div", "placeholder", text);
    box.style.setProperty("--c", colorMode === "category" ? CATEGORIES[key].color : "#94a3b8");
    place(box, 3, row);
  });
  place(make("div", "spacer"), "1 / 19", 9);
  place(make("div", "series-label", "Lanthanides"), "1 / 3", 10);
  place(make("div", "series-label", "Actinides"), "1 / 3", 11);
}

function makeCard(el, index = 0) {
  const card = make("button", "card");
  card.title = `${el.name} (${el.atomicNumber})`;
  card.style.setProperty("--c", getColor(el));
  card.style.animationDelay = Math.min(index * 6, 900) + "ms";
  card.append(make("span", "number", el.atomicNumber), make("span", "symbol", el.symbol), make("span", "name", el.name));
  card.addEventListener("click", () => openModal(el));
  return card;
}

function renderLegend() {
  legend.innerHTML = "";
  if (colorMode !== "category") return;
  Object.values(CATEGORIES).filter(cat => cat.label !== "Unknown").forEach(cat => {
    const item = make("span", "legend-item"), swatch = make("span", "legend-swatch");
    swatch.style.backgroundColor = swatch.style.color = cat.color;
    item.append(swatch, cat.label);
    legend.appendChild(item);
  });
}

function setDetail(id, value) {
  const box = document.getElementById(id);
  box.textContent = isEmpty(value) ? "No data available" : value;
  box.classList.toggle("no-data", isEmpty(value));
}

function loadPicture(el) {
  const sources = [{ url: el.photoUrl, caption: "Photo of " + el.name }, { url: el.bohrUrl, caption: "Bohr model of " + el.name }].filter(s => !isEmpty(s.url));
  const caption = document.getElementById("modal-caption");
  caption.textContent = "";
  modalImg.alt = "";
  let index = 0;
  function tryNext() {
    if (index >= sources.length) return modalPic.classList.remove("loaded");
    const source = sources[index++];
    modalImg.onload = () => { modalPic.classList.add("loaded"); caption.textContent = modalImg.alt = source.caption; };
    modalImg.onerror = tryNext;
    modalImg.src = source.url;
  }
  tryNext();
}

function openModal(el) {
  currentElement = el;
  modalPic.style.setProperty("--c", getColor(el));
  modalPic.classList.remove("loaded");
  document.getElementById("modal-symbol").textContent = el.symbol || "?";
  loadPicture(el);
  document.getElementById("modal-title").textContent = el.name || "Unknown";
  document.getElementById("modal-number").textContent = "Atomic number " + el.atomicNumber;
  const badge = document.getElementById("modal-badge");
  badge.textContent = CATEGORIES[el.category].label;
  badge.style.backgroundColor = CATEGORIES[el.category].color;
  Object.entries({
    "d-mass": el.atomicMass, "d-group": capitalize(el.groupBlock), "d-state": capitalize(el.standardState),
    "d-config": el.electronicConfiguration, "d-melt": formatTemp(el.meltingPoint), "d-boil": formatTemp(el.boilingPoint),
    "d-density": isEmpty(el.density) ? null : el.density + (el.standardState === "gas" ? " g/L" : " g/cm³"), "d-year": el.discoveredBy
  }).forEach(([id, value]) => setDetail(id, value));
  document.getElementById("modal-summary").textContent = isEmpty(el.summary) ? "" : el.summary;
  const position = visibleElements.indexOf(el);
  prevBtn.disabled = position <= 0;
  nextBtn.disabled = position === -1 || position >= visibleElements.length - 1;
  modal.classList.remove("hidden");
  closeBtn.focus();
}

const closeModal = () => modal.classList.add("hidden");

function showNeighbor(step) {
  const index = visibleElements.indexOf(currentElement);
  if (index !== -1 && visibleElements[index + step]) openModal(visibleElements[index + step]);
}

function setActive(buttons, activeButton) {
  buttons.forEach(btn => btn.classList.toggle("active", btn === activeButton));
}

searchForm.addEventListener("submit", event => { event.preventDefault(); searchText = searchInput.value; updateDisplay(); });
searchInput.addEventListener("input", () => { searchText = searchInput.value; updateDisplay(); });

clearBtn.addEventListener("click", () => {
  searchInput.value = searchText = "";
  activeFilter = "all";
  setActive(filterButtons, document.querySelector('.filter-btn[data-filter="all"]'));
  updateDisplay();
});

filterButtons.forEach(button => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  setActive(filterButtons, button);
  updateDisplay();
}));

modeButtons.forEach(button => button.addEventListener("click", () => {
  colorMode = button.dataset.mode;
  setActive(modeButtons, button);
  if (allElements.length > 0) updateDisplay();
}));

closeBtn.addEventListener("click", closeModal);
prevBtn.addEventListener("click", () => showNeighbor(-1));
nextBtn.addEventListener("click", () => showNeighbor(1));
modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
retryBtn.addEventListener("click", loadElements);

document.addEventListener("keydown", event => {
  if (modal.classList.contains("hidden")) return;
  if (event.key === "Escape") closeModal();
  if (event.key === "ArrowLeft") showNeighbor(-1);
  if (event.key === "ArrowRight") showNeighbor(1);
});

(function startStars() {
  const canvas = document.getElementById("space"), ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stars = [];
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = Array.from({ length: Math.floor(canvas.width * canvas.height / 9000) }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.3 + 0.2, speed: Math.random() * 0.15 + 0.02, phase: Math.random() * Math.PI * 2
    }));
  }
  function draw(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#cbd5ff";
    stars.forEach(star => {
      ctx.globalAlpha = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(time / 900 + star.phase));
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
      if (!reduceMotion) { star.y -= star.speed; if (star.y < -2) star.y = canvas.height + 2; }
    });
    requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
})();

loadElements();

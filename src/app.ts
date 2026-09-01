import {
  SOURCES, QUANTITIES, type SeedItem, type Source, type RawInput,
  validate, createItem, filterItems, sortByExpiry,
  getExpiryStatus, formatExpiry, PLANT_NAME_MAX_LEN, NOTES_MAX_LEN,
} from "./domain";
import { load, save } from "./storage";

let items: SeedItem[] = [];
let filterQuery = "";
let filterSource: Source | "" = "";
let sortMode: "expiry" | "name" = "expiry";
let editingId: string | null = null;
let armedDeleteId: string | null = null;
let armedDeleteTimer: ReturnType<typeof setTimeout> | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, txt?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};
const getById = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function announce(msg: string): void {
  const r = getById("live-region");
  r.textContent = "";
  requestAnimationFrame(() => { r.textContent = msg; });
}

function reportFailure(msg: string): void {
  const b = getById("storage-banner");
  b.hidden = false;
  requestAnimationFrame(() => { b.textContent = msg; });
  announce(`Error: ${msg}`);
}

function clearBanner(): void {
  const b = getById("storage-banner");
  b.hidden = true;
  b.textContent = "";
}

export function init(): void {
  const res = load();
  if (res.status === "ok") items = res.items;
  else if (res.status === "empty") items = [];
  else if (res.status === "partial") { items = res.items; reportFailure(res.message); }
  else if (res.status === "error") { items = []; reportFailure(res.message); }
  wireEvents();
  render();
}

function parseForm(form: HTMLFormElement): RawInput {
  const d = new FormData(form);
  return {
    plantName: String(d.get("plantName") ?? ""),
    source: String(d.get("source") ?? ""),
    packetYear: String(d.get("packetYear") ?? ""),
    quantity: String(d.get("quantity") ?? ""),
    notes: String(d.get("notes") ?? ""),
  };
}

function wireEvents(): void {
  getById("search-input").oninput = (e) => { filterQuery = (e.target as HTMLInputElement).value; render(); };
  getById("source-filter").onchange = (e) => { filterSource = (e.target as HTMLSelectElement).value as Source | ""; render(); };
  getById("sort-select").onchange = (e) => { sortMode = (e.target as HTMLSelectElement).value as "expiry" | "name"; render(); };
  getById("add-form").onsubmit = handleAddSubmit;
  document.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "clear-filters-btn") {
      filterQuery = ""; filterSource = "";
      (getById("search-input") as HTMLInputElement).value = "";
      (getById("source-filter") as HTMLSelectElement).value = "";
      render();
    } else if (armedDeleteId !== null) {
      const armed = document.querySelector<HTMLButtonElement>(`[data-delete-id="${armedDeleteId}"]`);
      if (armed && !armed.contains(t)) { disarmDelete(); render(); }
    }
  };
  document.onkeydown = (e) => {
    if (e.key === "Escape" && armedDeleteId !== null) { disarmDelete(); render(); }
  };
}

function handleAddSubmit(e: Event): void {
  e.preventDefault();
  const form = getById<HTMLFormElement>("add-form");
  const input = parseForm(form);
  const { ok, errors } = validate(input);
  clearFieldErrors("add");
  if (!ok) { showFieldErrors("add", errors); announce("Please fix the errors in the form before adding."); return; }
  const id = crypto.randomUUID();
  const newItem = createItem(input, id, new Date().toISOString());
  const next = [newItem, ...items];
  const res = save(next);
  if (res.status === "error") { reportFailure(res.message); return; }
  items = next;
  form.reset();
  clearBanner();
  render();
  announce(`Added "${newItem.plantName}" to the vault.`);
  requestAnimationFrame(() => {
    const card = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    if (card) { card.classList.add("card--new"); card.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  });
}

function clearFieldErrors(p: string): void {
  document.querySelectorAll(`[id^="${p}-err-"]`).forEach((e) => { e.textContent = ""; e.removeAttribute("role"); });
  document.querySelectorAll(`[data-form="${p}"]`).forEach((e) => { (e as HTMLElement).removeAttribute("aria-invalid"); });
}

function showFieldErrors(p: string, errors: Record<string, string | undefined>): void {
  for (const [k, msg] of Object.entries(errors)) {
    if (!msg) continue;
    const err = document.getElementById(`${p}-err-${k}`);
    if (err) { err.textContent = msg; err.setAttribute("role", "alert"); }
    const inp = document.querySelector<HTMLElement>(`[data-form="${p}"][name="${k}"]`);
    if (inp) inp.setAttribute("aria-invalid", "true");
  }
  const first = Object.keys(errors).find((k) => errors[k]);
  const inp = document.querySelector<HTMLElement>(`[data-form="${p}"][name="${first}"]`);
  inp?.focus();
}

function armDelete(id: string): void {
  if (armedDeleteTimer) clearTimeout(armedDeleteTimer);
  armedDeleteId = id;
  armedDeleteTimer = setTimeout(() => { disarmDelete(); render(); }, 3000);
}

function disarmDelete(): void {
  if (armedDeleteTimer) clearTimeout(armedDeleteTimer);
  armedDeleteTimer = null;
  armedDeleteId = null;
}

function confirmDelete(id: string): void {
  disarmDelete();
  const next = items.filter((i) => i.id !== id);
  const res = save(next);
  if (res.status === "error") { reportFailure(res.message); return; }
  const del = items.find((i) => i.id === id);
  items = next;
  clearBanner();
  render();
  announce(`Deleted "${del?.plantName ?? "packet"}" from the vault.`);
}

function startEdit(id: string): void { editingId = id; render(); }
function cancelEdit(): void { editingId = null; render(); }

function handleEditSubmit(id: string, form: HTMLFormElement): void {
  const input = parseForm(form);
  const { ok, errors } = validate(input);
  clearFieldErrors(`edit-${id}`);
  if (!ok) { showFieldErrors(`edit-${id}`, errors); announce("Please fix the errors before saving."); return; }
  const cur = items.find((i) => i.id === id);
  if (!cur) return;
  const updated: SeedItem = { ...createItem(input, id, cur.createdAt) };
  const next = items.map((i) => (i.id === id ? updated : i));
  const res = save(next);
  if (res.status === "error") { reportFailure(res.message); return; }
  items = next;
  editingId = null;
  clearBanner();
  render();
  announce(`Updated "${updated.plantName}".`);
}

function renderStats(curYear: number): void {
  getById("stat-total").textContent = String(items.length);
  getById("stat-expiring").textContent = String(items.filter((i) => getExpiryStatus(i.packetYear, curYear) !== "ok").length);
  for (const s of SOURCES) {
    const el = document.getElementById(`stat-${s}`);
    if (el) el.textContent = String(items.filter((i) => i.source === s).length);
  }
}

function createQuantityIndicator(qty: SeedItem["quantity"]): HTMLElement {
  const w = el("div", "quantity-indicator");
  w.setAttribute("aria-label", `Quantity: ${qty}`);
  const l = qty === "full" ? 3 : qty === "partial" ? 2 : 1;
  for (let i = 1; i <= 3; i++) w.appendChild(el("span", `qty-bar qty-bar--${i} qty-bar--${i <= l ? "filled" : "empty"}`));
  w.appendChild(el("span", "quantity-label", qty));
  return w;
}

function createCard(item: SeedItem, curYear: number): HTMLElement {
  const status = getExpiryStatus(item.packetYear, curYear);
  const card = el("article", `card card--${status}`);
  card.dataset.itemId = item.id;

  const header = el("div", "card__header");
  header.append(el("h3", "card__name", item.plantName), el("span", `badge badge--source badge--${item.source}`, item.source));

  const expRow = el("div", "card__expiry");
  expRow.appendChild(el("span", `badge badge--expiry badge--${status}`, formatExpiry(item.packetYear, curYear)));

  const isArmed = armedDeleteId === item.id;
  const delBtn = el("button", `btn btn--danger btn--sm${isArmed ? " btn--armed" : ""}`, isArmed ? "Confirm delete?" : "Delete");
  delBtn.setAttribute("aria-label", `${isArmed ? "Confirm delete" : "Delete"} ${item.plantName}`);
  delBtn.dataset.deleteId = item.id;
  delBtn.onclick = () => { if (armedDeleteId === item.id) confirmDelete(item.id); else { disarmDelete(); armDelete(item.id); render(); } };

  const editBtn = el("button", "btn btn--secondary btn--sm", "Edit");
  editBtn.setAttribute("aria-label", `Edit ${item.plantName}`);
  editBtn.onclick = () => startEdit(item.id);

  const actions = el("div", "card__actions");
  actions.append(editBtn, delBtn);

  card.append(header, expRow, createQuantityIndicator(item.quantity));
  if (item.notes) card.appendChild(el("p", "card__notes", item.notes));
  card.appendChild(actions);
  return card;
}

function mkField(p: string, name: string, label: string, type: string, value: string, opts?: readonly string[], max?: number): HTMLElement {
  const g = el("div", "form-group");
  const l = el("label", "form-label", label);
  const id = `${p}-${name}`;
  l.setAttribute("for", id);
  let inp: HTMLElement;
  if (opts) {
    const s = el("select", "form-input");
    s.id = id; s.name = name; s.dataset.form = p;
    s.setAttribute("aria-describedby", `${p}-err-${name}`);
    for (const o of opts) {
      const opt = el("option", undefined, o); opt.value = o; if (o === value) opt.selected = true;
      s.appendChild(opt);
    }
    inp = s;
  } else if (type === "textarea") {
    const t = el("textarea", "form-input");
    t.id = id; t.name = name; t.value = value; t.dataset.form = p;
    if (max) t.maxLength = max;
    inp = t;
  } else {
    const i = el("input", "form-input");
    i.id = id; i.name = name; i.type = type; i.value = value; i.dataset.form = p;
    i.setAttribute("aria-describedby", `${p}-err-${name}`);
    if (max) i.maxLength = max;
    inp = i;
  }
  const err = el("span", "field-error");
  err.id = `${p}-err-${name}`;
  g.append(l, inp, err);
  return g;
}

function createEditForm(item: SeedItem): HTMLElement {
  const p = `edit-${item.id}`;
  const wrap = el("article", "card card--editing");
  wrap.dataset.itemId = item.id;
  wrap.appendChild(el("h3", "card__name", `Editing: ${item.plantName}`));

  const form = el("form", "edit-form");
  form.id = `${p}-form`;

  const saveBtn = el("button", "btn btn--primary btn--sm", "Save"); saveBtn.type = "submit";
  const cancelBtn = el("button", "btn btn--secondary btn--sm", "Cancel"); cancelBtn.type = "button";
  cancelBtn.onclick = cancelEdit;
  const actions = el("div", "card__actions");
  actions.append(saveBtn, cancelBtn);

  form.append(
    mkField(p, "plantName", "Plant name", "text", item.plantName, undefined, PLANT_NAME_MAX_LEN),
    mkField(p, "source", "Seed source", "", item.source, SOURCES),
    mkField(p, "packetYear", "Packet year", "number", String(item.packetYear)),
    mkField(p, "quantity", "Quantity remaining", "", item.quantity, QUANTITIES),
    mkField(p, "notes", "Notes", "textarea", item.notes, undefined, NOTES_MAX_LEN),
    actions
  );

  form.onsubmit = (e) => { e.preventDefault(); handleEditSubmit(item.id, form); };
  wrap.appendChild(form);
  return wrap;
}

function createEmptyNoResults(query: string, source: string): HTMLElement {
  const w = el("div", "empty-state");
  const icon = el("div", "empty-state__icon");
  icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
  const parts = [query && `"${query}"`, source && `source: ${source}`].filter(Boolean);
  const clearBtn = el("button", "btn btn--secondary", "Clear filters");
  clearBtn.id = "clear-filters-btn";
  w.append(
    icon,
    el("h2", "empty-state__heading", "No matching packets"),
    el("p", "empty-state__body", `No seeds match ${parts.join(" and ")}. Try adjusting your search or filters.`),
    clearBtn
  );
  return w;
}

export function render(): void {
  const curYear = new Date().getFullYear();
  renderStats(curYear);
  const grid = getById("seed-grid");
  grid.innerHTML = "";

  let displayed = filterItems(items, filterQuery, filterSource);
  displayed = sortMode === "expiry" ? sortByExpiry(displayed) : [...displayed].sort((a, b) => a.plantName.localeCompare(b.plantName));

  const noItemsEl = getById("empty-no-items");
  const noResultsEl = getById("empty-no-results");

  if (items.length === 0) { noItemsEl.hidden = false; noResultsEl.hidden = true; return; }
  noItemsEl.hidden = true;

  if (displayed.length === 0) {
    noResultsEl.hidden = false;
    noResultsEl.innerHTML = "";
    noResultsEl.appendChild(createEmptyNoResults(filterQuery, filterSource));
    const desc = [filterQuery && `"${filterQuery}"`, filterSource && `source: ${filterSource}`].filter(Boolean).join(" and ");
    announce(`No packets match ${desc}.`);
    return;
  }
  noResultsEl.hidden = true;

  for (const item of displayed) {
    grid.appendChild(editingId === item.id ? createEditForm(item) : createCard(item, curYear));
  }
}

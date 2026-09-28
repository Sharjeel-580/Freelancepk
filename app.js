const storageKey = "freelancepk-workspace-v1";
const importMarker = "freelancepk-imported-v1";
const pageNames = { dashboard: "Overview", invoices: "Invoices", clients: "Clients", rates: "Rate calculator" };
let state = { clients: [], invoices: [], dashboard: null };
let currentUser = null;
let editingInvoiceId = null;
let editingClientId = null;
let toastTimer;
const currency = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });
const money = (value) => `PKR ${currency.format(Number(value) || 0)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const byId = (id) => document.getElementById(id);
const createId = () => globalThis.crypto?.randomUUID?.() || `fpk-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function apiRequest(path, options = {}) {
  const headers = { Accept: "application/json", ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  if (response.status === 204) return null;
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function refreshWorkspace() {
  const [clientsResult, invoicesResult, dashboard] = await Promise.all([
    apiRequest("/api/clients"),
    apiRequest("/api/invoices"),
    apiRequest("/api/dashboard"),
  ]);
  state = { clients: clientsResult.clients, invoices: invoicesResult.invoices, dashboard };
  renderClients();
  renderInvoices();
  renderDashboard();
}

async function importLegacyWorkspace(userId) {
  const marker = importMarker;
  if (localStorage.getItem(marker)) return false;
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { return false; }
  if (!legacy || !Array.isArray(legacy.clients) || !Array.isArray(legacy.invoices) || (!legacy.clients.length && !legacy.invoices.length)) return false;
  const clients = legacy.clients.map((client) => ({ ...client, id: String(client.id), email: client.email || "" }));
  const invoices = legacy.invoices.map((invoice) => ({ ...invoice, id: String(invoice.id), number: String(invoice.number), clientId: invoice.clientId ? String(invoice.clientId) : undefined, status: ["draft", "unpaid", "paid"].includes(invoice.status) ? invoice.status : "unpaid" }));
  await apiRequest("/api/import/local", { method: "POST", body: JSON.stringify({ clients, invoices }) });
  localStorage.setItem(marker, "done");
  return true;
}

function showAuth(message = "") {
  byId("app-shell").hidden = true;
  byId("boot-screen").hidden = true;
  byId("auth-screen").hidden = false;
  setAuthMode(false);
  byId("auth-error").textContent = message;
  byId("auth-error").hidden = !message;
}

async function enterWorkspace(user, attemptImport = true) {
  currentUser = user;
  byId("account-name").textContent = user.name;
  byId("auth-screen").hidden = true;
  byId("boot-screen").hidden = false;
  try {
    if (attemptImport) {
      try {
        const imported = await importLegacyWorkspace(user.id);
        if (imported) showToast("Your saved browser data was imported. The local copy was kept.");
      } catch (error) {
        showToast("Previous browser data could not be imported. Your local copy was kept.");
      }
    }
    await refreshWorkspace();
  } catch (error) {
    console.error("Workspace data could not be loaded.", error);
    if (error.status === 401) return showAuth("Your session expired. Please sign in again.");
    showAuth(error.message || "Could not connect to your workspace. Check the database configuration and try again.");
    return;
  }
  byId("boot-screen").hidden = true;
  byId("app-shell").hidden = false;
  const initialView = location.hash.slice(1);
  navigate(pageNames[initialView] ? initialView : "dashboard");
}

async function initializeWorkspace() {
  try {
    const result = await apiRequest("/api/auth/me");
    if (!result.user) return showAuth();
    await enterWorkspace(result.user);
  } catch (error) {
    if (error.status === 401) showAuth();
    else showAuth(error.message || "Could not connect to FreelancePK. Check that the server and database are running.");
  }
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function navigate(view) {
  if (!pageNames[view]) return;
  document.querySelectorAll(".view").forEach((section) => {
    const active = section.id === `view-${view}`;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  byId("page-name").textContent = pageNames[view];
  if (view === "invoices") renderInvoices();
  if (view === "clients") renderClients();
  if (view === "dashboard") renderDashboard();
  history.replaceState(null, "", `#${view}`);
}

function renderDashboard() {
  const now = new Date();
  byId("today-date").textContent = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now).toUpperCase();
  const paidAmount = state.dashboard?.paidAmount ?? state.invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const outstanding = state.invoices.filter((invoice) => invoice.status === "unpaid");
  const unpaidAmount = state.dashboard?.unpaidAmount ?? outstanding.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  byId("stat-earned").textContent = money(paidAmount);
  byId("stat-outstanding").textContent = money(unpaidAmount);
  byId("stat-outstanding-count").textContent = outstanding.length ? `${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"} waiting` : "No invoices waiting";
  byId("stat-clients").textContent = state.dashboard?.totalClients ?? state.clients.length;
  byId("stat-invoices").textContent = state.dashboard?.totalInvoices ?? state.invoices.length;
  const recent = [...state.invoices].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 4);
  byId("recent-invoices").innerHTML = recent.length ? recent.map((invoice) => `
    <div class="recent-row"><div class="recent-client">${escapeHtml(invoice.clientName)}<span class="recent-id">${escapeHtml(invoice.number)} · ${formatDate(invoice.date)}</span></div>
    <span class="status-pill ${invoice.status === "paid" ? "paid" : ""}">${invoice.status === "paid" ? "Paid" : invoice.status === "draft" ? "Draft" : "Awaiting"}</span><span class="recent-amount">${money(invoice.total)}</span></div>`).join("") : `<div class="empty-state">Your first invoice will show up here.<button class="text-button" data-action="new-invoice">Create an invoice <span aria-hidden="true">→</span></button></div>`;
}

function formatDate(date) {
  if (!date) return "No date";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "No date" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(parsed);
}

function localDateInput(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderClients() {
  const select = byId("invoice-client");
  const selected = select.value;
  select.innerHTML = `<option value="">Choose a client</option>${state.clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`).join("")}`;
  if (state.clients.some((client) => client.id === selected)) select.value = selected;
  byId("client-count").textContent = state.clients.length;
  byId("client-list").innerHTML = state.clients.length ? state.clients.map((client) => `
    <div class="client-row"><span class="client-avatar">${escapeHtml(client.name.trim().charAt(0).toUpperCase())}</span><div><div class="client-name">${escapeHtml(client.name)}</div><div class="client-details">${escapeHtml(client.company || client.email || client.phone || client.platform || "No contact details")}${client.email && client.company ? ` · ${escapeHtml(client.email)}` : ""}</div></div><div class="client-actions"><button class="small-action" data-action="view-client" data-id="${escapeHtml(client.id)}">View</button><button class="small-action" data-action="edit-client" data-id="${escapeHtml(client.id)}">Edit</button><button class="client-delete" data-action="delete-client" data-id="${escapeHtml(client.id)}" aria-label="Delete ${escapeHtml(client.name)}">Delete</button></div></div>`).join("") : `<div class="empty-state">No clients yet. Add one here to start an invoice.</div>`;
}

function addLineItem(item = {}) {
  const row = document.createElement("div");
  row.className = "line-item";
  row.innerHTML = `<input class="item-description" type="text" maxlength="100" placeholder="Work delivered" aria-label="Line item description" value="${escapeHtml(item.description || "")}" required><input class="item-quantity" type="number" min="0.01" step="0.01" value="${Number(item.quantity) || 1}" aria-label="Quantity or hours" required><input class="item-rate" type="number" min="0" step="100" value="${Number(item.rate) || 0}" aria-label="Rate in Pakistani rupees" required><span class="line-item-total">PKR 0</span><button class="remove-line" type="button" aria-label="Remove line item">×</button>`;
  byId("line-items").append(row);
  updateInvoiceTotal();
}

function collectLineItems() {
  return [...document.querySelectorAll(".line-item")].map((row) => ({
    description: row.querySelector(".item-description").value.trim(),
    quantity: Number(row.querySelector(".item-quantity").value) || 0,
    rate: Number(row.querySelector(".item-rate").value) || 0,
  }));
}

function updateInvoiceTotal() {
  let total = 0;
  document.querySelectorAll(".line-item").forEach((row) => {
    const quantity = Number(row.querySelector(".item-quantity").value) || 0;
    const rate = Number(row.querySelector(".item-rate").value) || 0;
    const amount = quantity * rate;
    total += amount;
    row.querySelector(".line-item-total").textContent = money(amount);
  });
  byId("invoice-total").textContent = money(total);
}

function resetInvoice() {
  editingInvoiceId = null;
  byId("invoice-form").reset();
  byId("invoice-client").value = "";
  byId("invoice-date").value = localDateInput();
  const due = new Date();
  due.setDate(due.getDate() + 14);
  byId("invoice-due").value = localDateInput(due);
  byId("invoice-note").value = "";
  byId("line-items").replaceChildren();
  addLineItem();
  byId("invoice-form-title").textContent = "New invoice";
  byId("invoice-number").textContent = "Assigned on save";
  document.querySelector(".cancel-edit").hidden = true;
}

function renderInvoices() {
  renderClients();
  byId("invoice-count").textContent = state.invoices.length;
  const invoices = [...state.invoices].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  byId("saved-invoices").innerHTML = invoices.length ? invoices.map((invoice) => `
    <article class="saved-row"><div class="saved-row-main"><div class="saved-client">${escapeHtml(invoice.clientName)}<span class="saved-meta">${escapeHtml(invoice.number)} · ${formatDate(invoice.date)}</span></div><span class="saved-total">${money(invoice.total)}</span></div>
    <div class="saved-row-bottom"><span class="status-pill ${invoice.status === "paid" ? "paid" : ""}">${invoice.status === "paid" ? "Paid" : invoice.status === "draft" ? "Draft" : "Awaiting"}</span><div class="saved-actions"><button class="small-action" data-action="view-invoice" data-id="${escapeHtml(invoice.id)}">Details</button><button class="small-action" data-action="edit-invoice" data-id="${escapeHtml(invoice.id)}">Edit</button><button class="small-action" data-action="print-invoice" data-id="${escapeHtml(invoice.id)}">Print</button><button class="small-action" data-action="toggle-paid" data-id="${escapeHtml(invoice.id)}">${invoice.status === "paid" ? "Mark unpaid" : "Mark paid"}</button><button class="small-action destructive-action" data-action="delete-invoice" data-id="${escapeHtml(invoice.id)}">Delete</button></div></div></article>`).join("") : `<div class="empty-state">No invoices saved yet. Your next paid day starts here.</div>`;
  if (!editingInvoiceId) byId("invoice-number").textContent = "Assigned on save";
}

async function saveInvoice(event) {
  event.preventDefault();
  const client = state.clients.find((item) => item.id === byId("invoice-client").value);
  const items = collectLineItems();
  if (!client) return showToast("Add or choose a client before saving.");
  if (!items.length || items.some((item) => !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.rate) || item.rate < 0)) return showToast("Check each line: add a description, positive quantity, and non-negative rate.");
  const issueDate = byId("invoice-date").value;
  const dueDate = byId("invoice-due").value;
  if (!issueDate || !dueDate || dueDate < issueDate) return showToast("Enter valid dates and make the due date on or after the issue date.");
  const total = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  if (!Number.isFinite(total)) return showToast("The invoice total is too large to save.");
  const previous = editingInvoiceId ? state.invoices.find((item) => item.id === editingInvoiceId) : null;
  if (editingInvoiceId && !previous) return showToast("This invoice could not be found. Refresh and try again.");
  const body = { clientId: client.id, issueDate, dueDate, notes: byId("invoice-note").value.trim() || null, items };
  const submitButton = byId("invoice-form").querySelector("button[type='submit']");
  submitButton.disabled = true;
  try {
    if (editingInvoiceId) await apiRequest(`/api/invoices/${encodeURIComponent(editingInvoiceId)}`, { method: "PATCH", body: JSON.stringify(body) });
    else await apiRequest("/api/invoices", { method: "POST", body: JSON.stringify(body) });
    resetInvoice();
    await refreshWorkspace();
    showToast("Invoice saved to your account.");
  } catch (error) {
    showToast(error.message || "Invoice could not be saved.");
  } finally {
    submitButton.disabled = false;
  }
}

function editInvoice(id) {
  const invoice = state.invoices.find((item) => item.id === id);
  if (!invoice) return;
  byId("record-dialog").close();
  editingInvoiceId = invoice.id;
  byId("invoice-client").value = invoice.clientId;
  byId("invoice-date").value = invoice.date;
  byId("invoice-due").value = invoice.dueDate;
  byId("invoice-note").value = invoice.note || "";
  byId("line-items").replaceChildren();
  invoice.items.forEach(addLineItem);
  byId("invoice-form-title").textContent = "Edit invoice";
  byId("invoice-number").textContent = invoice.number;
  document.querySelector(".cancel-edit").hidden = false;
  byId("invoice-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showInvoiceDetails(id) {
  const invoice = state.invoices.find((item) => item.id === id);
  if (!invoice) return showToast("This invoice could not be found.");
  byId("record-dialog-eyebrow").textContent = `INVOICE · ${invoice.status === "paid" ? "PAID" : invoice.status === "draft" ? "DRAFT" : "AWAITING PAYMENT"}`;
  byId("record-dialog-title").textContent = invoice.number;
  const rows = invoice.items.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${currency.format(item.quantity)}</td><td>${money(item.rate)}</td><td>${money(item.quantity * item.rate)}</td></tr>`).join("");
  byId("record-details").innerHTML = `<div class="detail-summary"><div><span>CLIENT</span><strong>${escapeHtml(invoice.clientName)}</strong></div><div><span>ISSUED</span><strong>${escapeHtml(formatDate(invoice.date))}</strong></div><div><span>DUE DATE</span><strong>${escapeHtml(formatDate(invoice.dueDate))}</strong></div><div><span>STATUS</span><strong>${invoice.status === "paid" ? "Paid" : invoice.status === "draft" ? "Draft" : "Awaiting payment"}</strong></div></div><div class="detail-table-scroll"><table class="detail-table"><thead><tr><th>DESCRIPTION</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead><tbody>${rows}</tbody></table></div><div class="detail-total"><span>Total</span><strong>${money(invoice.total)}</strong></div>${invoice.note ? `<p class="detail-note">${escapeHtml(invoice.note)}</p>` : ""}<div class="detail-actions"><button class="button button-dark" data-action="edit-invoice" data-id="${escapeHtml(invoice.id)}">Edit invoice</button><button class="button button-outline" data-action="print-invoice" data-id="${escapeHtml(invoice.id)}">Print</button><button class="text-button" data-action="toggle-paid" data-id="${escapeHtml(invoice.id)}">Mark ${invoice.status === "paid" ? "unpaid" : "paid"}</button></div>`;
  byId("record-dialog").showModal();
}

function resetClientForm() {
  editingClientId = null;
  byId("client-form").reset();
  byId("client-form-title").textContent = "Add a client";
  byId("client-submit").innerHTML = `Add client <span aria-hidden="true">↗</span>`;
  byId("cancel-client-edit").hidden = true;
}

function editClient(id) {
  const client = state.clients.find((item) => item.id === id);
  if (!client) return showToast("This client could not be found.");
  byId("record-dialog").close();
  editingClientId = client.id;
  byId("client-name").value = client.name;
  byId("client-email").value = client.email || "";
  byId("client-company").value = client.company || "";
  byId("client-phone").value = client.phone || "";
  byId("client-notes").value = client.notes || "";
  byId("client-platform").value = client.platform || "Direct";
  byId("client-form-title").textContent = "Edit client";
  byId("client-submit").innerHTML = `Save changes <span aria-hidden="true">↗</span>`;
  byId("cancel-client-edit").hidden = false;
  byId("client-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showClientDetails(id) {
  const client = state.clients.find((item) => item.id === id);
  if (!client) return showToast("This client could not be found.");
  const invoices = state.invoices.filter((invoice) => invoice.clientId === client.id);
  byId("record-dialog-eyebrow").textContent = "CLIENT DETAILS";
  byId("record-dialog-title").textContent = client.name;
  byId("record-details").innerHTML = `<div class="detail-summary"><div><span>EMAIL</span><strong>${client.email ? `<a href="mailto:${escapeHtml(client.email)}">${escapeHtml(client.email)}</a>` : "Not provided"}</strong></div><div><span>COMPANY</span><strong>${escapeHtml(client.company || "Not provided")}</strong></div><div><span>PHONE</span><strong>${escapeHtml(client.phone || "Not provided")}</strong></div><div><span>PLATFORM</span><strong>${escapeHtml(client.platform || "Direct")}</strong></div><div><span>INVOICES</span><strong>${invoices.length}</strong></div><div><span>OUTSTANDING</span><strong>${money(invoices.filter((invoice) => invoice.status === "unpaid").reduce((sum, invoice) => sum + Number(invoice.total || 0), 0))}</strong></div></div>${client.notes ? `<p class="detail-note">${escapeHtml(client.notes)}</p>` : ""}<h3 class="detail-subheading">Invoice history</h3>${invoices.length ? `<div class="client-history">${invoices.map((invoice) => `<div><span>${escapeHtml(invoice.number)} · ${formatDate(invoice.date)}</span><strong>${money(invoice.total)}</strong></div>`).join("")}</div>` : `<p class="detail-note">No invoices for this client yet.</p>`}<div class="detail-actions"><button class="button button-dark" data-action="edit-client" data-id="${escapeHtml(client.id)}">Edit client</button><button class="button button-outline" data-action="delete-client" data-id="${escapeHtml(client.id)}">Delete client</button></div>`;
  byId("record-dialog").showModal();
}

function invoiceForPrint(invoice) {
  const items = invoice.items.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${currency.format(item.quantity)}</td><td>${money(item.rate)}</td><td>${money(item.quantity * item.rate)}</td></tr>`).join("");
  byId("print-area").innerHTML = `<div class="print-header"><div class="print-brand">FreelancePK</div><div class="print-meta"><strong>INVOICE ${escapeHtml(invoice.number)}</strong><br>Issued ${escapeHtml(formatDate(invoice.date))}<br>Due ${escapeHtml(formatDate(invoice.dueDate))}</div></div><div class="print-parties"><div><span class="print-label">BILL TO</span><strong>${escapeHtml(invoice.clientName)}</strong></div><div><span class="print-label">FROM</span><strong>FreelancePK workspace</strong></div></div><table class="print-table"><thead><tr><th>DESCRIPTION</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead><tbody>${items}</tbody></table><div class="print-total"><span>Total due</span><span>${money(invoice.total)}</span></div>${invoice.note ? `<p class="print-note">${escapeHtml(invoice.note)}</p>` : ""}<p class="print-thanks">Thank you for working together.</p>`;
  window.print();
}

function draftInvoiceForPrint() {
  const client = state.clients.find((item) => item.id === byId("invoice-client").value);
  const items = collectLineItems();
  if (!client || !items.length) return showToast("Choose a client and add an item before printing.");
  invoiceForPrint({ number: editingInvoiceId ? state.invoices.find((item) => item.id === editingInvoiceId)?.number : "DRAFT", clientName: client.name, date: byId("invoice-date").value, dueDate: byId("invoice-due").value, items, total: items.reduce((sum, item) => sum + item.quantity * item.rate, 0), note: byId("invoice-note").value.trim() });
}

function setAuthMode(register) {
  byId("login-form").hidden = register;
  byId("register-form").hidden = !register;
  byId("auth-title").textContent = register ? "Start with a clear view." : "Welcome back.";
  byId("auth-copy").textContent = register ? "Create your private FreelancePK workspace." : "Sign in to continue to your FreelancePK workspace.";
  byId("auth-switch").innerHTML = register ? `Already have an account? <strong>Sign in</strong>` : `New to FreelancePK? <strong>Create an account</strong>`;
  byId("auth-error").hidden = true;
  byId("auth-error").textContent = "";
}

async function submitAuth(event, mode) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const body = mode === "register"
    ? { name: byId("register-name").value.trim(), email: byId("register-email").value.trim(), password: byId("register-password").value }
    : { email: byId("login-email").value.trim(), password: byId("login-password").value };
  submitButton.disabled = true;
  byId("auth-error").hidden = true;
  try {
    const result = await apiRequest(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
    byId(mode === "register" ? "register-password" : "login-password").value = "";
    await enterWorkspace(result.user);
  } catch (error) {
    byId("auth-error").textContent = error.message || "Could not sign in. Please try again.";
    byId("auth-error").hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

function calculateRate() {
  const target = Math.max(0, Number(byId("rate-target").value) || 0);
  const expenses = Math.max(0, Number(byId("rate-expenses").value) || 0);
  const tax = Math.min(80, Math.max(0, Number(byId("rate-tax").value) || 0)) / 100;
  const hours = Math.min(80, Math.max(1, Number(byId("rate-hours").value) || 1));
  const days = Math.min(7, Math.max(1, Number(byId("rate-days").value) || 1));
  const buffer = Math.min(80, Math.max(0, Number(byId("rate-buffer").value) || 0)) / 100;
  const capacity = hours * (52 / 12) * (1 - buffer);
  const hourly = capacity > 0 ? (target + expenses) / (1 - tax) / capacity : 0;
  const daily = hourly * (hours / days);
  const monthly = hourly * capacity;
  byId("rate-result").innerHTML = `${money(hourly)}<span> / hour</span>`;
  byId("rate-daily").textContent = money(daily);
  byId("rate-monthly").textContent = money(monthly);
  byId("rate-capacity").textContent = capacity.toFixed(0);
}

function isInvoiceNumberInput(target) {
  return typeof target?.matches === "function" && target.matches(".item-quantity, .item-rate");
}

function replaceFocusedInvoiceNumber(event, value) {
  const input = event.target;
  if (!isInvoiceNumberInput(input) || input.dataset.replaceOnInput !== "true" || !value || !/^\d*\.?\d*$/.test(value) || !event.cancelable) return false;
  event.preventDefault();
  input.value = value;
  delete input.dataset.replaceOnInput;
  updateInvoiceTotal();
  return true;
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) return navigate(viewButton.dataset.view);
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const { action, id } = actionButton.dataset;
  if (action === "new-invoice") { navigate("invoices"); resetInvoice(); }
  if (action === "reset-invoice") resetInvoice();
  if (action === "reset-client") resetClientForm();
  if (action === "print-draft") draftInvoiceForPrint();
  if (action === "edit-invoice") editInvoice(id);
  if (action === "view-invoice") showInvoiceDetails(id);
  if (action === "view-client") showClientDetails(id);
  if (action === "edit-client") editClient(id);
  if (action === "close-details") byId("record-dialog").close();
  if (action === "print-invoice") { const invoice = state.invoices.find((item) => item.id === id); if (invoice) invoiceForPrint(invoice); }
  if (action === "toggle-paid") {
    void (async () => {
      const invoice = state.invoices.find((item) => item.id === id);
      if (!invoice) return showToast("This invoice could not be found.");
      const reopenDetails = byId("record-dialog").open;
      try {
        await apiRequest(`/api/invoices/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status: invoice.status === "paid" ? "unpaid" : "paid" }) });
        if (reopenDetails) byId("record-dialog").close();
        await refreshWorkspace();
        if (reopenDetails) showInvoiceDetails(id);
        showToast("Invoice payment status updated.");
      } catch (error) { showToast(error.message || "Could not update invoice status."); }
    })();
  }
  if (action === "delete-invoice") {
    const invoice = state.invoices.find((item) => item.id === id);
    if (!invoice || !window.confirm(`Delete invoice ${invoice.number}? This cannot be undone.`)) return;
    void (async () => {
      try {
        await apiRequest(`/api/invoices/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (editingInvoiceId === id) resetInvoice();
        if (byId("record-dialog").open) byId("record-dialog").close();
        await refreshWorkspace(); showToast("Invoice deleted.");
      } catch (error) { showToast(error.message || "Could not delete invoice."); }
    })();
  }
  if (action === "delete-client") {
    const client = state.clients.find((item) => item.id === id);
    if (!client || !window.confirm(`Delete ${client.name}? Saved invoices keep their client details.`)) return;
    void (async () => {
      try {
        await apiRequest(`/api/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (editingClientId === id) resetClientForm();
        if (byId("record-dialog").open) byId("record-dialog").close();
        await refreshWorkspace(); showToast("Client deleted. Invoice history was kept.");
      } catch (error) { showToast(error.message || "Could not delete client."); }
    })();
  }
  if (action === "logout") {
    void (async () => {
      try {
        await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
        currentUser = null;
        state = { clients: [], invoices: [], dashboard: null };
        showAuth();
      } catch (error) { showToast(error.message || "Could not sign out."); }
    })();
  }
  if (action === "toggle-auth") setAuthMode(byId("register-form").hidden);
});

document.addEventListener("focusin", (event) => {
  if (!isInvoiceNumberInput(event.target)) return;
  event.target.dataset.replaceOnInput = "true";
  try { event.target.select(); } catch {}
});

document.addEventListener("keydown", (event) => {
  if (!/^[0-9.]$/.test(event.key) || !isInvoiceNumberInput(event.target)) return;
  replaceFocusedInvoiceNumber(event, event.key);
});

document.addEventListener("beforeinput", (event) => {
  if (event.inputType?.startsWith("insert")) replaceFocusedInvoiceNumber(event, event.data);
});

document.addEventListener("paste", (event) => {
  if (!isInvoiceNumberInput(event.target) || event.target.dataset.replaceOnInput !== "true") return;
  replaceFocusedInvoiceNumber(event, event.clipboardData?.getData("text").trim());
});

document.addEventListener("input", (event) => {
  if (isInvoiceNumberInput(event.target)) {
    if (event.inputType?.startsWith("insert") && event.data) replaceFocusedInvoiceNumber(event, event.data);
    updateInvoiceTotal();
  }
  if (event.target.closest("#rate-form")) calculateRate();
});

document.addEventListener("click", (event) => {
  if (event.target.id === "add-line") addLineItem();
  if (event.target.matches(".remove-line")) {
    if (document.querySelectorAll(".line-item").length === 1) return showToast("Keep at least one line item in the invoice.");
    event.target.closest(".line-item").remove();
    updateInvoiceTotal();
  }
});

byId("invoice-form").addEventListener("submit", saveInvoice);
byId("client-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = byId("client-name").value.trim();
  const wasEditing = Boolean(editingClientId);
  if (!name) return showToast("Enter a client or company name.");
  const client = { name, email: byId("client-email").value.trim(), company: byId("client-company").value.trim(), phone: byId("client-phone").value.trim(), notes: byId("client-notes").value.trim(), platform: byId("client-platform").value };
  const submitButton = byId("client-submit");
  submitButton.disabled = true;
  try {
    await apiRequest(wasEditing ? `/api/clients/${encodeURIComponent(editingClientId)}` : "/api/clients", { method: wasEditing ? "PATCH" : "POST", body: JSON.stringify(client) });
    resetClientForm();
    await refreshWorkspace();
    showToast(wasEditing ? "Client details updated." : `${name} added to your clients.`);
  } catch (error) { showToast(error.message || "Client could not be saved."); }
  finally { submitButton.disabled = false; }
});
byId("rate-form").addEventListener("input", calculateRate);
byId("login-form").addEventListener("submit", (event) => void submitAuth(event, "login"));
byId("register-form").addEventListener("submit", (event) => void submitAuth(event, "register"));
git
resetInvoice();git
initializeWorkspace();git add .gitignore
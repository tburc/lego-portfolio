let collection = [];
let valuationHistory = [];
let currentUser = null;
let toastTimer;
let selectedChartPeriod = "ALL";
let editingItem = null;
let pendingDeleteItem = null;
let selectedSetChartPeriod = "ALL";
let selectedSetItem = null;
let selectedSetHistory = [];
let portfolioChartHoverPoints = [];
let setChartHoverPoints = [];

const dialog = document.querySelector("#dialog");
const form = dialog.querySelector("form");
const lookupButton = document.querySelector("#lookup-set");
const saveButton = document.querySelector("#save-set");
const searchInput = document.querySelector("#set-number");
const lookupResult = document.querySelector("#lookup-result");
const lookupResults = document.querySelector("#lookup-results");
const nameInput = document.querySelector("#new-name");
const valueInput = document.querySelector("#new-value");
const purchaseInput = document.querySelector("#purchase-price");
const holdingsList = document.querySelector("#holdings-list");
const addButton = document.querySelector("#add-set");
const editDialog = document.querySelector("#edit-dialog");
const editForm = document.querySelector("#edit-form");
const editName = document.querySelector("#edit-name");
const editPurchasePrice = document.querySelector("#edit-purchase-price");
const editCurrentValue = document.querySelector("#edit-current-value");
const editResult = document.querySelector("#edit-result");
const saveEditButton = document.querySelector("#save-edit");
const deleteDialog = document.querySelector("#delete-dialog");
const deleteForm = document.querySelector("#delete-form");
const deleteItemName = document.querySelector("#delete-item-name");
const confirmDeleteButton = document.querySelector("#confirm-delete");
const deleteAccountDialog = document.querySelector("#delete-account-dialog");
const deleteAccountForm = document.querySelector("#delete-account-form");
const deleteAccountConfirmation = document.querySelector("#delete-account-confirmation");
const deleteAccountResult = document.querySelector("#delete-account-result");
const confirmDeleteAccountButton = document.querySelector("#confirm-delete-account");
const setChartDialog = document.querySelector("#set-chart-dialog");
const imageDialog = document.querySelector("#image-dialog");
const galleryImage = document.querySelector("#gallery-image");
const imagePrevious = document.querySelector("#image-previous");
const imageNext = document.querySelector("#image-next");
const imageCounter = document.querySelector("#image-counter");
const brickOwlDialog = document.querySelector("#brickowl-dialog");
const brickOwlForm = document.querySelector("#brickowl-form");
const brickOwlApiKey = document.querySelector("#brickowl-api-key");
const brickOwlCurrency = document.querySelector("#brickowl-currency");
const brickOwlSharePublic = document.querySelector("#brickowl-share-public");
const brickOwlResult = document.querySelector("#brickowl-result");
const brickOwlStatus = document.querySelector("#brickowl-status");
const brickOwlSummary = document.querySelector("#brickowl-summary");
const connectBrickOwlButton = document.querySelector("#connect-brickowl");
const syncBrickOwlButton = document.querySelector("#sync-brickowl");
const disconnectBrickOwlButton = document.querySelector("#disconnect-brickowl");
const sellerListings = document.querySelector("#seller-listings");
const sellerListingSummary = document.querySelector("#seller-listing-summary");
const price = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
let galleryImages = [];
let galleryIndex = 0;
let galleryRequest = 0;
const holdingMetricModes = ["equity", "totalReturn", "totalPercent", "todayReturn"];
let holdingMetricMode = localStorage.getItem("legofolio-holding-metric") || "equity";
if (!holdingMetricModes.includes(holdingMetricMode)) holdingMetricMode = "equity";

function holdingMetric(item) {
  const equity = Number(item.estimated_value || 0);
  const cost = Number(item.purchase_price || 0);
  const totalReturn = equity - cost;
  const totalPercent = cost > 0 ? (totalReturn / cost) * 100 : null;
  const sign = totalReturn >= 0 ? "+" : "−";
  const tone = totalReturn >= 0 ? "positive" : "negative";

  if (holdingMetricMode === "totalReturn") return { label: "Total return", value: `${sign}${price(Math.abs(totalReturn))}`, tone };
  if (holdingMetricMode === "totalPercent") {
    return totalPercent === null
      ? { label: "Total return %", value: "—", tone: "unavailable" }
      : { label: "Total return %", value: `${sign}${Math.abs(totalPercent).toFixed(1)}%`, tone };
  }
  if (holdingMetricMode === "todayReturn") {
    return { label: "Today's return", value: "—", tone: "unavailable", title: "Daily item price history is not available yet" };
  }
  return { label: "Your equity", value: price(equity), tone: "" };
}

function cycleHoldingMetric() {
  const currentIndex = holdingMetricModes.indexOf(holdingMetricMode);
  holdingMetricMode = holdingMetricModes[(currentIndex + 1) % holdingMetricModes.length];
  localStorage.setItem("legofolio-holding-metric", holdingMetricMode);
  renderCollection();
}

function enableChartScrubbing(stage, lineId, dotId, tooltipId, pointsProvider) {
  const svg = stage.querySelector("svg");
  let line = document.querySelector(`#${lineId}`);
  let dot = document.querySelector(`#${dotId}`);
  let tooltip = document.querySelector(`#${tooltipId}`);
  if (!line) {
    line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.id = lineId;
    line.classList.add("chart-scrub-line");
    line.setAttribute("y1", "15");
    line.setAttribute("y2", "265");
    svg.append(line);
  }
  if (!dot) {
    dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.id = dotId;
    dot.classList.add("chart-scrub-dot");
    dot.setAttribute("r", "6");
    svg.append(dot);
  }
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = tooltipId;
    tooltip.className = "chart-tooltip";
    tooltip.innerHTML = "<strong></strong><span></span>";
    tooltip.hidden = true;
    stage.append(tooltip);
  }

  const hide = () => {
    line.style.opacity = "0";
    dot.style.opacity = "0";
    tooltip.hidden = true;
  };
  const scrub = (event) => {
    const points = pointsProvider();
    if (!points.length || svg.hidden) return hide();
    const bounds = svg.getBoundingClientRect();
    const chartX = Math.max(0, Math.min(700, ((event.clientX - bounds.left) / bounds.width) * 700));
    let point = points[0];
    if (points.length > 1) {
      const rightIndex = points.findIndex((candidate) => candidate.x >= chartX);
      if (rightIndex < 0) point = points.at(-1);
      else if (rightIndex === 0) point = points[0];
      else {
        const left = points[rightIndex - 1];
        const right = points[rightIndex];
        const ratio = Math.max(0, Math.min(1, (chartX - left.x) / Math.max(right.x - left.x, 0.001)));
        point = {
          x: left.x + (right.x - left.x) * ratio,
          y: left.y + (right.y - left.y) * ratio,
          value: left.value + (right.value - left.value) * ratio,
          date: new Date(left.date.getTime() + (right.date.getTime() - left.date.getTime()) * ratio),
        };
      }
    }
    line.setAttribute("x1", point.x);
    line.setAttribute("x2", point.x);
    dot.setAttribute("cx", point.x);
    dot.setAttribute("cy", point.y);
    line.style.opacity = "1";
    dot.style.opacity = "1";
    tooltip.querySelector("strong").textContent = price(point.value);
    tooltip.querySelector("span").textContent = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(point.date);
    tooltip.style.left = `${Math.max(12, Math.min(88, (point.x / 700) * 100))}%`;
    tooltip.hidden = false;
  };
  stage.addEventListener("pointermove", scrub);
  stage.addEventListener("pointerdown", scrub);
  stage.addEventListener("pointerleave", hide);
  stage.addEventListener("pointercancel", hide);
}

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

function renderGalleryImage() {
  galleryImage.src = galleryImages[galleryIndex] || "";
  imageCounter.textContent = `${galleryIndex + 1} / ${galleryImages.length || 1}`;
  imagePrevious.disabled = galleryImages.length < 2;
  imageNext.disabled = galleryImages.length < 2;
}

function moveGallery(direction) {
  if (galleryImages.length < 2) return;
  galleryIndex = (galleryIndex + direction + galleryImages.length) % galleryImages.length;
  renderGalleryImage();
}

async function openGallery(details) {
  const request = ++galleryRequest;
  galleryImages = [details.image].filter(Boolean);
  galleryIndex = 0;
  galleryImage.alt = `${details.name} LEGO set`;
  renderGalleryImage();
  imageCounter.textContent = details.type === "set" ? "Loading photos…" : "1 / 1";
  imageDialog.showModal();
  let setId = details.bricksetSetId;
  if (!setId && details.type === "set" && details.number) {
    try {
      const { data, error } = await window.supabaseClient.functions.invoke("lookup-set", {
        body: { query: details.number, includeMinifigures: false, limit: 5 },
      });
      if (request !== galleryRequest) return;
      if (!error && !data?.error) {
        const match = (data?.results || []).find((item) => item.set_num === details.number);
        setId = match?.brickset_set_id;
      }
    } catch {}
  }
  if (!setId) return renderGalleryImage();
  try {
    const { data, error } = await window.supabaseClient.functions.invoke("set-images", {
      body: { setId },
    });
    if (request !== galleryRequest) return;
    if (error || data?.error) return renderGalleryImage();
    const nextImages = [...new Set([...galleryImages, ...(data.images || [])])];
    await Promise.all(nextImages.slice(1).map((src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = src;
    })));
    if (request !== galleryRequest) return;
    galleryImages = nextImages;
    galleryIndex = 0;
    renderGalleryImage();
  } catch {
    if (request === galleryRequest) renderGalleryImage();
  }
}

const levels = [
  { at: 0, name: "Brick Starter" },
  { at: 5, name: "Set Scout" },
  { at: 15, name: "Master Builder" },
  { at: 30, name: "Vault Curator" },
  { at: 60, name: "LEGO Legend" },
];

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function marketplacePrice(value, currency) {
  if (value === null || value === undefined) return "Price unavailable";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${currency || ""} ${Number(value).toFixed(2)}`.trim();
  }
}

function brickOwlError(error, data) {
  return data?.error || error?.context?.error || error?.message || "Brick Owl request failed.";
}

function setBrickOwlBusy(isBusy, label = "Working…") {
  [connectBrickOwlButton, syncBrickOwlButton, disconnectBrickOwlButton].forEach((button) => {
    button.disabled = isBusy;
  });
  if (isBusy) brickOwlStatus.textContent = label;
}

function renderBrickOwlAccount(account) {
  const connected = Boolean(account);
  connectBrickOwlButton.hidden = connected;
  syncBrickOwlButton.hidden = !connected;
  disconnectBrickOwlButton.hidden = !connected;
  brickOwlStatus.className = `connection-status${connected ? account.status === "error" ? " error" : " connected" : ""}`;

  if (!connected) {
    brickOwlStatus.textContent = "Not connected";
    brickOwlSummary.textContent = "Connect a seller account with a read-only API key.";
    return;
  }

  const identity = account.external_store_name || account.external_username || "Brick Owl seller";
  brickOwlStatus.textContent = account.status === "error" ? `${identity} · sync needs attention` : `${identity} · connected`;
  const synced = account.last_synced_at ? new Date(account.last_synced_at).toLocaleString() : "not synced yet";
  brickOwlSummary.textContent = `${account.inventory_count || 0} active store listings · ${account.matched_set_count || 0} catalog sets matched · last sync ${synced}`;
  brickOwlSharePublic.checked = account.share_listings_publicly !== false;
  brickOwlCurrency.value = account.currency_code || "USD";
}

function renderSellerListings(rows) {
  sellerListings.replaceChildren();
  sellerListingSummary.textContent = rows.length
    ? `${rows.length} active listing${rows.length === 1 ? "" : "s"} shown from your linked stores.`
    : "No active seller listings imported yet.";

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-collection";
    empty.innerHTML = "<strong>No seller listings yet</strong><span>Connect or sync a marketplace seller account to import its inventory.</span>";
    sellerListings.append(empty);
    return;
  }

  rows.forEach((listing) => {
    const article = document.createElement("article");
    article.className = "seller-listing";
    const visual = listing.image_url ? document.createElement("img") : document.createElement("span");
    if (listing.image_url) {
      visual.src = listing.image_url;
      visual.alt = "";
    } else {
      visual.className = "listing-placeholder";
      visual.textContent = "BO";
    }
    const details = document.createElement("div");
    const name = document.createElement(listing.listing_url ? "a" : "strong");
    name.textContent = listing.title;
    if (listing.listing_url) {
      name.href = listing.listing_url;
      name.target = "_blank";
      name.rel = "noopener noreferrer";
    }
    const meta = document.createElement("small");
    meta.textContent = `${listing.marketplace === "brickowl" ? "Brick Owl" : listing.marketplace} · ${listing.item_condition} · quantity ${listing.quantity}${listing.set_num ? ` · Set ${listing.set_num}` : " · not matched to a catalog set"}`;
    details.append(name, meta);
    const amount = document.createElement("strong");
    amount.className = "seller-listing-price";
    amount.textContent = marketplacePrice(listing.unit_price, listing.currency_code);
    article.append(visual, details, amount);
    sellerListings.append(article);
  });
}

async function loadSellerListings() {
  const { data, error } = await window.supabaseClient
    .from("seller_listings")
    .select("marketplace,external_listing_id,set_num,title,item_type,item_condition,quantity,unit_price,currency_code,listing_url,image_url,last_seen_at")
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(100);

  if (error) {
    sellerListingSummary.textContent = "Seller portfolio is unavailable until its database migration is installed.";
    return;
  }
  renderSellerListings(data || []);
}

async function loadBrickOwlAccount() {
  const { data, error } = await window.supabaseClient.functions.invoke("connect-brickowl", {
    body: { action: "status" },
  });
  if (error || data?.error) {
    brickOwlStatus.className = "connection-status error";
    brickOwlStatus.textContent = "Integration not deployed";
    brickOwlSummary.textContent = brickOwlError(error, data);
  } else {
    renderBrickOwlAccount(data.account);
  }
  await loadSellerListings();
}

connectBrickOwlButton.addEventListener("click", () => {
  brickOwlForm.reset();
  brickOwlSharePublic.checked = true;
  brickOwlCurrency.value = "USD";
  brickOwlResult.textContent = "";
  brickOwlDialog.showModal();
  setTimeout(() => brickOwlApiKey.focus(), 50);
});

document.querySelector("#cancel-brickowl").addEventListener("click", () => brickOwlDialog.close("cancel"));

brickOwlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const apiKey = brickOwlApiKey.value.trim();
  if (!apiKey) return;
  const submitButton = document.querySelector("#save-brickowl");
  submitButton.disabled = true;
  submitButton.textContent = "Connecting…";
  brickOwlResult.textContent = "Validating the key and importing active listings…";
  const { data, error } = await window.supabaseClient.functions.invoke("connect-brickowl", {
    body: { action: "connect", apiKey, currency: brickOwlCurrency.value, sharePublic: brickOwlSharePublic.checked },
  });
  brickOwlApiKey.value = "";
  if (error || data?.error) {
    brickOwlResult.textContent = brickOwlError(error, data);
    submitButton.disabled = false;
    submitButton.textContent = "Connect and sync";
    return;
  }
  brickOwlDialog.close();
  submitButton.disabled = false;
  submitButton.textContent = "Connect and sync";
  showToast(`Brick Owl connected. ${data.account?.inventoryCount || 0} listings imported.`);
  await loadBrickOwlAccount();
});

syncBrickOwlButton.addEventListener("click", async () => {
  setBrickOwlBusy(true, "Syncing Brick Owl inventory…");
  const { data, error } = await window.supabaseClient.functions.invoke("connect-brickowl", {
    body: { action: "sync" },
  });
  setBrickOwlBusy(false);
  if (error || data?.error) {
    showToast(brickOwlError(error, data));
  } else {
    showToast(`Synced ${data.inventoryCount || 0} Brick Owl listings.`);
  }
  await loadBrickOwlAccount();
});

disconnectBrickOwlButton.addEventListener("click", async () => {
  if (!window.confirm("Disconnect Brick Owl and remove its imported seller listings from legofolio?")) return;
  setBrickOwlBusy(true, "Disconnecting…");
  const { data, error } = await window.supabaseClient.functions.invoke("connect-brickowl", {
    body: { action: "disconnect" },
  });
  setBrickOwlBusy(false);
  if (error || data?.error) return showToast(brickOwlError(error, data));
  renderBrickOwlAccount(null);
  renderSellerListings([]);
  showToast("Brick Owl disconnected and its imported listings were removed.");
});

function resetDialog() {
  form.reset();
  lookupResults.replaceChildren();
  lookupResults.hidden = true;
  lookupResult.textContent = "";
  delete searchInput.dataset.itemNumber;
  delete searchInput.dataset.itemType;
  delete searchInput.dataset.imageUrl;
  delete searchInput.dataset.year;
  delete searchInput.dataset.pieces;
  saveButton.disabled = true;
  saveButton.textContent = "Add item";
}

function openDialog() {
  resetDialog();
  dialog.showModal();
  setTimeout(() => searchInput.focus(), 50);
}

function renderWatchlist() {
  const watchlist = [["The Milky Way Galaxy", "$164.99"], ["Medieval Town Square", "$229.99"], ["Wolfpack Beastmaster", "$18.50"]];
  document.querySelector("#watchlist-list").innerHTML = watchlist.map(([name, value]) => `<article class="watch"><div><strong>${name}</strong><small>Watchlisted set</small></div><div><strong>${value}</strong><small>Watching</small></div></article>`).join("");
}

function updateProgress() {
  const total = collection.length;
  const sets = collection.filter((item) => item.item_type === "set").length;
  const minifigures = collection.filter((item) => item.item_type === "minifigure").length;
  const totalValue = collection.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  const totalCost = collection.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0);
  const gain = totalValue - totalCost;
  const gainPercent = totalCost > 0 ? (gain / totalCost) * 100 : 0;
  const best = collection.reduce((winner, item) => !winner || Number(item.estimated_value) > Number(winner.estimated_value) ? item : winner, null);
  let levelIndex = levels.findLastIndex((level) => total >= level.at);
  if (levelIndex < 0) levelIndex = 0;
  const level = levels[levelIndex];
  const next = levels[levelIndex + 1];
  const progress = next ? ((total - level.at) / (next.at - level.at)) * 100 : 100;

  document.querySelector("#total-value").textContent = price(totalValue);
  const portfolioGain = document.querySelector("#portfolio-gain");
  portfolioGain.textContent = `${gain >= 0 ? "+" : "−"}${price(Math.abs(gain))} (${gain >= 0 ? "+" : "−"}${Math.abs(gainPercent).toFixed(1)}%) all time`;
  portfolioGain.className = gain >= 0 ? "positive" : "negative";
  document.querySelector("#value-line").style.stroke = gain >= 0 ? "#147a47" : "#c0524d";
  document.querySelector("#value-area").style.fill = gain >= 0 ? "#bceecb99" : "#f3c8c599";
  document.querySelector("#value-dot").style.fill = gain >= 0 ? "#e8b84c" : "#c0524d";
  document.querySelector("#set-count").textContent = sets;
  document.querySelector("#minifigure-count").textContent = minifigures;
  document.querySelector("#item-count").textContent = total;
  document.querySelector("#best-value").textContent = best ? price(best.estimated_value) : "$0.00";
  document.querySelector("#best-item").textContent = best?.name || "No items yet";
  document.querySelector("#set-detail").textContent = sets === 1 ? "1 set recorded" : `${sets} sets recorded`;
  document.querySelector("#minifigure-detail").textContent = minifigures === 1 ? "1 figure recorded" : `${minifigures} figures recorded`;
  document.querySelector("#item-detail").textContent = total ? "Existing portfolio records" : "Manual additions disabled";
  document.querySelector("#collection-message").textContent = total ? `${total} existing item${total === 1 ? "" : "s"} in this portfolio.` : "Manual portfolio additions are currently unavailable.";
  document.querySelector("#collector-level").textContent = `Level ${levelIndex + 1} · ${level.name}`;
  document.querySelector("#level-count").textContent = next ? `${total} / ${next.at}` : `${total} items`;
  document.querySelector("#level-progress").style.width = `${Math.min(progress, 100)}%`;
  document.querySelector("#next-milestone").textContent = total && next ? `${next.at - total} item${next.at - total === 1 ? "" : "s"} until ${next.name}` : total ? "Highest collector level reached" : "Verified portfolio tracking is coming later";

  const setValue = collection
    .filter((item) => item.item_type === "set")
    .reduce((sum, item) => sum + Math.max(0, Number(item.estimated_value) || 0), 0);
  const minifigureValue = collection
    .filter((item) => item.item_type === "minifigure")
    .reduce((sum, item) => sum + Math.max(0, Number(item.estimated_value) || 0), 0);
  const categorizedValue = setValue + minifigureValue;
  const setPercent = categorizedValue > 0 ? Math.round((setValue / categorizedValue) * 100) : 0;
  const minifigurePercent = categorizedValue > 0 ? 100 - setPercent : 0;
  const mixDonut = document.querySelector("#mix-donut");
  document.querySelector("#set-mix").textContent = `${setPercent}%`;
  document.querySelector("#minifigure-mix").textContent = `${minifigurePercent}%`;
  document.querySelector("#set-mix-value").textContent = price(setValue);
  document.querySelector("#minifigure-mix-value").textContent = price(minifigureValue);
  document.querySelector("#mix-total-value").textContent = `${price(categorizedValue)} total`;
  mixDonut.innerHTML = `<span class="mix-donut-label"><strong>${categorizedValue > 0 ? "100%" : "0%"}</strong><small>allocated</small></span>`;
  mixDonut.style.background = categorizedValue > 0
    ? `conic-gradient(#147a47 0 ${setPercent}%, #e8b84c ${setPercent}% 100%)`
    : "#edf2ee";
  mixDonut.setAttribute("aria-label", categorizedValue > 0
    ? `Collection value allocation: sets ${setPercent} percent, minifigures ${minifigurePercent} percent`
    : "No valued collection items");
  renderValueChart();
}

function renderValueChart() {
  const currentValue = collection.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  const currentCost = collection.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0);
  const currentReturn = currentValue - currentCost;
  const points = [0, ...valuationHistory.map((entry) => Number(entry.total_value || 0) - Number(entry.total_cost || 0))];
  if (points.at(-1) !== currentReturn) points.push(currentReturn);
  const minValue = Math.min(...points, 0);
  const maxValue = Math.max(...points, 1);
  const range = Math.max(maxValue - minValue, 1);
  const width = 400;
  const top = 8;
  const bottom = 72;
  const chartPoints = points.length === 1 ? [points[0], points[0]] : points;
  const coordinates = chartPoints.map((value, index) => ({
    x: (index / (chartPoints.length - 1)) * width,
    y: bottom - ((value - minValue) / range) * (bottom - top),
  }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = coordinates.at(-1);
  document.querySelector("#value-line").setAttribute("d", line);
  document.querySelector("#value-area").setAttribute("d", `${line} L${last.x.toFixed(1)} 80 L0 80 Z`);
  document.querySelector("#value-dot").setAttribute("cx", last.x);
  document.querySelector("#value-dot").setAttribute("cy", last.y);
  document.querySelector("#chart-caption").textContent = valuationHistory.length ? `${valuationHistory.length} saved update${valuationHistory.length === 1 ? "" : "s"}` : "No history yet";
  if (document.querySelector("#chart-dialog").open) renderDetailedChart(selectedChartPeriod);
}

function periodStart(period) {
  const now = new Date();
  const start = new Date(now);
  const days = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365, "5Y": 1825, "10Y": 3650, "20Y": 7300 };
  if (period === "ALL") return null;
  if (period === "YTD") return new Date(now.getFullYear(), 0, 1);
  start.setDate(start.getDate() - days[period]);
  return start;
}

function historyForPeriod(period) {
  const start = periodStart(period);
  if (!start) {
    if (!valuationHistory.length) return [];
    const firstTime = new Date(valuationHistory[0].recorded_at).getTime();
    return [{ total_value: 0, total_cost: 0, recorded_at: new Date(firstTime - 1).toISOString() }, ...valuationHistory];
  }
  const inRange = valuationHistory.filter((entry) => new Date(entry.recorded_at) >= start);
  const earlier = valuationHistory.filter((entry) => new Date(entry.recorded_at) < start).at(-1);
  return earlier ? [{ ...earlier, recorded_at: start.toISOString() }, ...inRange] : inRange;
}

function renderDetailedChart(period) {
  selectedChartPeriod = period;
  const history = historyForPeriod(period).map((entry) => ({ ...entry }));
  const currentValue = collection.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0);
  const currentCost = collection.reduce((sum, item) => sum + Number(item.purchase_price || 0), 0);
  const currentReturn = currentValue - currentCost;
  const now = new Date();
  const lastReturn = history.length ? Number(history.at(-1).total_value || 0) - Number(history.at(-1).total_cost || 0) : null;
  if (!history.length || lastReturn !== currentReturn || new Date(history.at(-1).recorded_at) < now) {
    history.push({ total_value: currentValue, total_cost: currentCost, recorded_at: now.toISOString() });
  }
  const values = history.map((entry) => Number(entry.total_value || 0) - Number(entry.total_cost || 0));
  const latest = values.at(-1) || 0;
  const first = values[0] ?? latest;
  const change = latest - first;
  const changePercent = currentCost > 0 ? (change / currentCost) * 100 : 0;
  const positive = change >= 0;
  const detailValue = document.querySelector("#detail-value");
  const detailChange = document.querySelector("#detail-change");
  detailValue.textContent = `${latest >= 0 ? "+" : "−"}${price(Math.abs(latest))}`;
  detailChange.textContent = `${positive ? "+" : "−"}${price(Math.abs(change))} (${positive ? "+" : "−"}${Math.abs(changePercent).toFixed(1)}%) · ${period}`;
  detailChange.className = positive ? "positive" : "negative";
  document.querySelectorAll("#chart-dialog .chart-period").forEach((button) => button.classList.toggle("active", button.dataset.period === period));
  document.querySelector("#chart-empty").hidden = history.length > 0;

  const chartHistory = history.length === 1
    ? [{ ...history[0], recorded_at: (periodStart(period) || new Date(now.getTime() - 86400000)).toISOString() }, history[0]]
    : history;
  const points = chartHistory.map((entry) => Number(entry.total_value || 0) - Number(entry.total_cost || 0));
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const axisStart = periodStart(period) || new Date(chartHistory[0].recorded_at);
  const axisEnd = now;
  const axisRange = Math.max(axisEnd - axisStart, 1);
  const coordinates = chartHistory.map((entry) => ({
    x: Math.max(0, Math.min(700, ((new Date(entry.recorded_at) - axisStart) / axisRange) * 700)),
    value: Number(entry.total_value || 0) - Number(entry.total_cost || 0),
    date: new Date(entry.recorded_at),
  })).map((point) => ({
    ...point,
    y: 255 - ((point.value - min) / range) * 230,
  }));
  portfolioChartHoverPoints = coordinates;
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = coordinates.at(-1);
  const lineElement = document.querySelector("#detail-line");
  const areaElement = document.querySelector("#detail-area");
  const dotElement = document.querySelector("#detail-dot");
  lineElement.setAttribute("d", line);
  areaElement.setAttribute("d", `${line} L${last.x.toFixed(1)} 280 L${coordinates[0].x.toFixed(1)} 280 Z`);
  dotElement.setAttribute("cx", last.x);
  dotElement.setAttribute("cy", last.y);
  lineElement.style.stroke = positive ? "#147a47" : "#c0524d";
  areaElement.style.fill = positive ? "#bceecb80" : "#f3c8c580";
  dotElement.style.fill = positive ? "#e8b84c" : "#c0524d";
}

function makeAction(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `item-action ${className}`;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function editItem(item) {
  editingItem = item;
  editName.value = item.name;
  editPurchasePrice.value = Number(item.purchase_price || 0).toFixed(2);
  editCurrentValue.value = Number(item.estimated_value || 0).toFixed(2);
  editResult.textContent = "";
  saveEditButton.disabled = false;
  saveEditButton.textContent = "Save changes";
  editDialog.showModal();
  setTimeout(() => editPurchasePrice.select(), 50);
}

function deleteItem(item) {
  pendingDeleteItem = item;
  deleteItemName.textContent = item.name;
  confirmDeleteButton.disabled = false;
  confirmDeleteButton.textContent = "Remove item";
  deleteDialog.showModal();
}

function renderSetChart(period) {
  selectedSetChartPeriod = period;
  const start = periodStart(period);
  const history = selectedSetHistory.filter((entry) => !start || new Date(entry.recorded_at) >= start);
  document.querySelectorAll(".set-chart-period").forEach((button) => button.classList.toggle("active", button.dataset.period === period));
  const empty = document.querySelector("#set-chart-empty");
  const svg = document.querySelector("#set-chart-dialog svg");
  const latest = history.length ? Number(history.at(-1).average_item_price || 0) : Number(selectedSetItem?.estimated_value || 0);
  document.querySelector("#set-detail-value").textContent = price(latest);
  empty.hidden = history.length >= 2;
  svg.hidden = false;
  if (history.length < 2) {
    const onlyEntry = history[0];
    const currentPoint = {
      x: 700,
      y: 140,
      value: onlyEntry ? Number(onlyEntry.average_item_price || 0) : latest,
      date: onlyEntry ? new Date(onlyEntry.recorded_at) : new Date(),
    };
    setChartHoverPoints = [currentPoint];
    document.querySelector("#set-detail-line").setAttribute("d", "M700 140");
    document.querySelector("#set-detail-area").setAttribute("d", "M700 140 L700 280 Z");
    document.querySelector("#set-detail-dot").setAttribute("cx", "700");
    document.querySelector("#set-detail-dot").setAttribute("cy", "140");
    document.querySelector("#set-detail-change").textContent = `Current tracked value · ${period}`;
    document.querySelector("#set-detail-change").className = "";
    return;
  }

  const values = history.map((entry) => Number(entry.average_item_price || 0));
  const change = values.at(-1) - values[0];
  const changePercent = values[0] > 0 ? (change / values[0]) * 100 : 0;
  const positive = change >= 0;
  document.querySelector("#set-detail-change").textContent = `${positive ? "+" : "−"}${price(Math.abs(change))} (${positive ? "+" : "−"}${Math.abs(changePercent).toFixed(1)}%) · ${period}`;
  document.querySelector("#set-detail-change").className = positive ? "positive" : "negative";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const firstTime = new Date(history[0].recorded_at).getTime();
  const lastTime = new Date(history.at(-1).recorded_at).getTime();
  const timeRange = Math.max(lastTime - firstTime, 1);
  const coordinates = history.map((entry) => ({
    x: ((new Date(entry.recorded_at).getTime() - firstTime) / timeRange) * 700,
    y: 255 - ((Number(entry.average_item_price || 0) - min) / range) * 230,
    value: Number(entry.average_item_price || 0),
    date: new Date(entry.recorded_at),
  }));
  setChartHoverPoints = coordinates;
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = coordinates.at(-1);
  document.querySelector("#set-detail-line").setAttribute("d", line);
  document.querySelector("#set-detail-area").setAttribute("d", `${line} L${last.x.toFixed(1)} 280 L${coordinates[0].x.toFixed(1)} 280 Z`);
  document.querySelector("#set-detail-dot").setAttribute("cx", last.x);
  document.querySelector("#set-detail-dot").setAttribute("cy", last.y);
}

async function openSetChart(item) {
  selectedSetItem = item;
  selectedSetHistory = [];
  document.querySelector("#set-chart-name").textContent = item.name;
  document.querySelector("#set-chart-subtitle").textContent = `Set ${item.item_number} · marketplace price history`;
  setChartDialog.showModal();
  renderSetChart(selectedSetChartPeriod);
  const { data, error } = await window.supabaseClient
    .from("marketplace_price_snapshots")
    .select("average_item_price,recorded_at,marketplace,currency_code")
    .eq("set_num", item.item_number)
    .order("recorded_at", { ascending: true })
    .limit(2000);
  if (selectedSetItem?.id !== item.id) return;
  if (error) {
    document.querySelector("#set-chart-empty").textContent = `Price history could not load: ${error.message}`;
    return;
  }
  selectedSetHistory = data || [];
  document.querySelector("#set-chart-empty").textContent = "Not enough real price history for this period yet.";
  renderSetChart(selectedSetChartPeriod);
}

async function confirmDelete(item) {
  const { error } = await window.supabaseClient.from("collection_items").delete().eq("id", item.id).eq("user_id", currentUser.id);
  if (error) {
    showToast(`Could not remove: ${error.message}`);
    return false;
  }
  collection = collection.filter((entry) => entry.id !== item.id);
  await loadHistory();
  renderCollection();
  showToast("Item removed from your collection.");
  return true;
}

function renderCollection() {
  holdingsList.replaceChildren();
  if (!collection.length) {
    const empty = document.createElement("div");
    empty.className = "empty-collection";
    empty.innerHTML = "<strong>No verified collection items yet</strong><span>Manual additions are disabled while ownership verification is being designed.</span>";
    holdingsList.append(empty);
  } else {
    collection.forEach((item) => {
      const article = document.createElement("article");
      article.className = "holding";
      const tile = document.createElement("span");
      tile.className = "tile";
      if (item.image_url) {
        const image = document.createElement("img");
        image.src = item.image_url;
        image.alt = "";
        tile.append(image);
        tile.classList.add("has-image");
        tile.tabIndex = 0;
        tile.setAttribute("role", "button");
        tile.setAttribute("aria-label", `View photos of ${item.name}`);
        const viewPhotos = () => openGallery(itemDetails(item));
        tile.addEventListener("click", viewPhotos);
        tile.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            viewPhotos();
          }
        });
      } else tile.textContent = item.item_type === "minifigure" ? "M" : "◆";
      const description = document.createElement("div");
      description.className = "holding-description";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const meta = document.createElement("small");
      meta.textContent = `${item.item_type === "minifigure" ? "Minifigure" : "Set"} ${item.item_number}${item.year ? ` · ${item.year}` : ""}`;
      description.append(name, meta);
      if (item.item_type === "set") {
        const chartHint = document.createElement("small");
        chartHint.className = "chart-link-hint";
        chartHint.textContent = "↗ View price graph";
        description.append(chartHint);
        description.tabIndex = 0;
        description.setAttribute("role", "button");
        description.setAttribute("aria-label", `Open price chart for ${item.name}`);
        description.addEventListener("click", () => openSetChart(item));
        description.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openSetChart(item);
          }
        });
      }
      const value = document.createElement("button");
      value.type = "button";
      const metric = holdingMetric(item);
      value.className = `holding-metric ${metric.tone}`.trim();
      value.title = metric.title || "Click to show the next portfolio metric";
      value.setAttribute("aria-label", `${item.name}: ${metric.label} ${metric.value}. Click to show the next metric.`);
      const amount = document.createElement("strong");
      amount.textContent = metric.value;
      const metricLabel = document.createElement("small");
      metricLabel.textContent = metric.label;
      value.append(amount, metricLabel);
      value.addEventListener("click", cycleHoldingMetric);
      const actions = document.createElement("div");
      actions.className = "holding-actions";
      actions.append(makeAction("Edit", "edit", () => editItem(item)), makeAction("Delete", "delete", () => deleteItem(item)));
      article.append(tile, description, value, actions);
      holdingsList.append(article);
    });
  }
  updateProgress();
}

async function loadCollection() {
  const [{ data, error }, historyResult] = await Promise.all([
    window.supabaseClient.from("collection_items").select("*").order("created_at", { ascending: false }),
    window.supabaseClient.from("collection_value_history").select("*").order("recorded_at", { ascending: false }).limit(200),
  ]);
  if (error) {
    const errorState = document.createElement("div");
    errorState.className = "empty-collection";
    const errorTitle = document.createElement("strong");
    errorTitle.textContent = "Collection could not load";
    const errorMessage = document.createElement("span");
    errorMessage.textContent = error.message;
    errorState.append(errorTitle, errorMessage);
    holdingsList.replaceChildren(errorState);
    return;
  }
  collection = data || [];
  valuationHistory = (historyResult.data || []).reverse();
  renderCollection();
}

async function loadHistory() {
  const { data } = await window.supabaseClient.from("collection_value_history").select("*").order("recorded_at", { ascending: false }).limit(200);
  valuationHistory = (data || []).reverse();
}

const searchItems = (data) => {
  if (Array.isArray(data)) return data;
  const grouped = ["results", "items", "sets", "minifigures", "minifigs"].flatMap((key) => Array.isArray(data?.[key]) ? data[key] : []);
  return grouped.length ? grouped : (data && !data.error ? [data] : []);
};

const itemDetails = (item) => {
  const type = item.type || item.item_type || (item.fig_num || item.minifig_num ? "minifigure" : "set");
  return {
    name: item.name || item.descr || "Unnamed LEGO item",
    number: item.set_num || item.fig_num || item.minifig_num || item.item_number || item.number || item.id || "",
    type,
    image: item.set_img_url || item.img_big || item.img_sm || item.img_tn || item.image_url || item.image || "",
    year: item.year || "",
    pieces: item.num_parts || item.pieces || "",
    retailPrice: Number(item.retail_price ?? item.retailPrice) || null,
    bricksetSetId: item.brickset_set_id || item.bricksetSetId || null,
  };
};

function showSearchItems(items) {
  lookupResults.replaceChildren();
  items.forEach((item) => {
    const details = itemDetails(item);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lookup-result-card";
    const image = document.createElement("img");
    image.alt = "";
    if (details.image) image.src = details.image;
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = details.name;
    const meta = document.createElement("small");
    meta.textContent = details.type === "minifigure"
      ? `Minifigure · ${details.number}`
      : `Set ${details.number}${details.year ? ` · ${details.year}` : ""}${details.retailPrice ? ` · Retail ${price(details.retailPrice)}` : ""}`;
    text.append(name, meta);
    button.append(image, text);
    const selectResult = () => {
      lookupResults.querySelectorAll("button").forEach((result) => result.classList.remove("selected"));
      button.classList.add("selected");
      nameInput.value = details.name;
      searchInput.dataset.itemNumber = details.number;
      searchInput.dataset.itemType = details.type;
      searchInput.dataset.imageUrl = details.image;
      searchInput.dataset.year = details.year;
      searchInput.dataset.pieces = details.pieces;
      purchaseInput.value = details.retailPrice ? details.retailPrice.toFixed(2) : "";
      valueInput.value = details.retailPrice ? details.retailPrice.toFixed(2) : "";
      lookupResult.textContent = details.retailPrice
        ? `Selected: ${details.name}. Original U.S. retail price filled from Brickset.`
        : `Selected: ${details.name}. Enter what you paid and its current value.`;
      saveButton.disabled = false;
      valueInput.focus();
    };
    image.addEventListener("click", (event) => {
      event.stopPropagation();
      selectResult();
      openGallery(details);
    });
    button.addEventListener("click", selectResult);
    lookupResults.append(button);
  });
  lookupResults.hidden = false;
}

document.querySelector("#image-close")?.addEventListener("click", () => imageDialog?.close());
imagePrevious?.addEventListener("click", () => moveGallery(-1));
imageNext?.addEventListener("click", () => moveGallery(1));
galleryImage?.addEventListener("click", () => moveGallery(1));
imageDialog?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") moveGallery(-1);
  if (event.key === "ArrowRight") moveGallery(1);
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!lookupButton.disabled) lookupButton.click();
});

lookupButton.addEventListener("click", async () => {
  const query = searchInput.value.trim();
  if (!query) return (lookupResult.textContent = "Enter a set or minifigure name or number.");
  lookupButton.disabled = true;
  lookupButton.textContent = "Searching…";
  lookupResult.textContent = "";
  lookupResults.hidden = true;
  saveButton.disabled = true;
  try {
    const { data, error } = await window.supabaseClient.functions.invoke("lookup-set", { body: { query, includeMinifigures: true, limit: 20 } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const items = searchItems(data).slice(0, 20);
    if (!items.length) throw new Error("No matching sets or minifigures found.");
    showSearchItems(items);
    lookupResult.textContent = `${items.length} result${items.length === 1 ? "" : "s"} found. Select one to add.`;
    if (items.length === 1) lookupResults.firstElementChild.click();
  } catch (error) {
    lookupResult.textContent = error.message || "Search failed.";
  } finally {
    lookupButton.disabled = false;
    lookupButton.textContent = "Search LEGO";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const estimatedValue = Number(valueInput.value);
  const purchasePrice = Number(purchaseInput.value);
  if (!nameInput.value || ![purchasePrice, estimatedValue].every((value) => Number.isFinite(value) && value >= 0)) return;
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  const item = {
    user_id: currentUser.id,
    item_number: searchInput.dataset.itemNumber || searchInput.value.trim(),
    name: nameInput.value.trim(),
    item_type: searchInput.dataset.itemType || "set",
    estimated_value: estimatedValue,
    purchase_price: purchasePrice,
    image_url: searchInput.dataset.imageUrl || null,
    year: Number(searchInput.dataset.year) || null,
    pieces: Number(searchInput.dataset.pieces) || null,
  };
  const { data, error } = await window.supabaseClient.from("collection_items").insert(item).select().single();
  if (error) {
    saveButton.disabled = false;
    saveButton.textContent = "Add item";
    return (lookupResult.textContent = `Could not save: ${error.message}`);
  }
  collection.unshift(data);
  await loadHistory();
  renderCollection();
  dialog.close();
  addButton.classList.add("celebrate");
  setTimeout(() => addButton.classList.remove("celebrate"), 500);
  const total = collection.length;
  showToast(total === 5 || total === 15 || total === 30 || total === 60 ? `Level up! ${data.name} unlocked a new collector level.` : `${data.name} added. Collection: ${total} item${total === 1 ? "" : "s"}.`);
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editingItem) return;
  const purchasePrice = Number(editPurchasePrice.value);
  const estimatedValue = Number(editCurrentValue.value);
  if (![purchasePrice, estimatedValue].every((value) => Number.isFinite(value) && value >= 0)) {
    editResult.textContent = "Enter valid prices of 0 or more.";
    return;
  }
  saveEditButton.disabled = true;
  saveEditButton.textContent = "Saving…";
  editResult.textContent = "";
  const { data, error } = await window.supabaseClient
    .from("collection_items")
    .update({ purchase_price: purchasePrice, estimated_value: estimatedValue })
    .eq("id", editingItem.id)
    .eq("user_id", currentUser.id)
    .select()
    .single();
  if (error) {
    saveEditButton.disabled = false;
    saveEditButton.textContent = "Save changes";
    editResult.textContent = `Could not save: ${error.message}`;
    return;
  }
  const index = collection.findIndex((item) => item.id === data.id);
  if (index >= 0) collection[index] = data;
  await loadHistory();
  renderCollection();
  editDialog.close();
  editingItem = null;
  showToast("Item updated successfully.");
});

addButton.addEventListener("click", openDialog);
document.querySelector("#add-from-empty").addEventListener("click", openDialog);
document.querySelector("#cancel-add").addEventListener("click", () => { resetDialog(); dialog.close("cancel"); });
dialog.addEventListener("cancel", resetDialog);
document.querySelector("#cancel-edit").addEventListener("click", () => { editingItem = null; editDialog.close("cancel"); });
editDialog.addEventListener("close", () => { editingItem = null; editResult.textContent = ""; });
document.querySelector("#cancel-delete").addEventListener("click", () => deleteDialog.close("cancel"));
deleteDialog.addEventListener("click", (event) => {
  if (event.target === deleteDialog) deleteDialog.close("cancel");
});
deleteDialog.addEventListener("close", () => { pendingDeleteItem = null; });
deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingDeleteItem) return;
  const item = pendingDeleteItem;
  confirmDeleteButton.disabled = true;
  confirmDeleteButton.textContent = "Removingâ€¦";
  const removed = await confirmDelete(item);
  if (removed) deleteDialog.close("confirmed");
  else {
    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = "Try again";
  }
});
const chartButton = document.querySelector("#open-chart");
const chartDialog = document.querySelector("#chart-dialog");
enableChartScrubbing(document.querySelector("#chart-dialog .chart-stage"), "portfolio-scrub-line", "portfolio-scrub-dot", "portfolio-chart-tooltip", () => portfolioChartHoverPoints);
enableChartScrubbing(document.querySelector("#set-chart-stage"), "set-scrub-line", "set-scrub-dot", "set-chart-tooltip", () => setChartHoverPoints);
const openDetailedChart = () => {
  renderDetailedChart(selectedChartPeriod);
  chartDialog.showModal();
};
chartButton.addEventListener("click", openDetailedChart);
chartButton.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openDetailedChart();
  }
});
document.querySelectorAll("#chart-dialog .chart-period").forEach((button) => button.addEventListener("click", () => renderDetailedChart(button.dataset.period)));
document.querySelectorAll(".set-chart-period").forEach((button) => button.addEventListener("click", () => renderSetChart(button.dataset.period)));
setChartDialog.addEventListener("close", () => {
  selectedSetItem = null;
  selectedSetHistory = [];
});
document.querySelector("#sign-out").addEventListener("click", async () => {
  await window.supabaseClient.auth.signOut();
  window.location.replace("index.html");
});
document.querySelector("#delete-account").addEventListener("click", () => {
  deleteAccountConfirmation.value = "";
  deleteAccountResult.textContent = "";
  confirmDeleteAccountButton.disabled = false;
  confirmDeleteAccountButton.textContent = "Delete forever";
  deleteAccountDialog.showModal();
  setTimeout(() => deleteAccountConfirmation.focus(), 50);
});
document.querySelector("#cancel-delete-account").addEventListener("click", () => deleteAccountDialog.close("cancel"));
deleteAccountDialog.addEventListener("click", (event) => {
  if (event.target === deleteAccountDialog) deleteAccountDialog.close("cancel");
});
deleteAccountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (deleteAccountConfirmation.value.trim() !== "DELETE") {
    deleteAccountResult.textContent = "Type DELETE exactly to continue.";
    return;
  }
  confirmDeleteAccountButton.disabled = true;
  confirmDeleteAccountButton.textContent = "Deleting…";
  deleteAccountResult.textContent = "";
  const { data, error } = await window.supabaseClient.functions.invoke("delete-account", { body: { confirmation: "DELETE" } });
  if (error || data?.error) {
    deleteAccountResult.textContent = data?.error || error.message;
    confirmDeleteAccountButton.disabled = false;
    confirmDeleteAccountButton.textContent = "Try again";
    return;
  }
  await window.supabaseClient.auth.signOut();
  window.location.replace("index.html?account=deleted");
});

async function initialize() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) return window.location.replace("index.html");
  currentUser = session.user;
  const pendingTermsVersion = sessionStorage.getItem("legofolio-oauth-terms-version");
  if (pendingTermsVersion) {
    const { error: termsError } = await window.supabaseClient.rpc("accept_current_terms", { accepted_version: pendingTermsVersion });
    if (!termsError) sessionStorage.removeItem("legofolio-oauth-terms-version");
  }
  const username = currentUser.user_metadata.username || currentUser.email.split("@")[0];
  document.querySelector("#profile-name").textContent = username;
  document.querySelector("#welcome-message").textContent = `Good afternoon, ${username}.`;
  document.querySelector(".avatar").textContent = username.slice(0, 2).toUpperCase();
  const { data: isAdmin } = await window.supabaseClient.rpc("is_admin");
  document.querySelector("#admin-nav-link").hidden = !isAdmin;
  renderWatchlist();
  await Promise.all([loadCollection(), loadBrickOwlAccount()]);
}

initialize();

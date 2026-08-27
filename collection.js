let collection = [];
let valuationHistory = [];
let currentUser = null;
let toastTimer;
let selectedChartPeriod = "ALL";
let editingItem = null;

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
const imageDialog = document.querySelector("#image-dialog");
const galleryImage = document.querySelector("#gallery-image");
const imagePrevious = document.querySelector("#image-previous");
const imageNext = document.querySelector("#image-next");
const imageCounter = document.querySelector("#image-counter");
const price = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
let galleryImages = [];
let galleryIndex = 0;
let galleryRequest = 0;

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
  document.querySelector("#set-detail").textContent = sets === 1 ? "1 set in your vault" : `${sets} sets in your vault`;
  document.querySelector("#minifigure-detail").textContent = minifigures === 1 ? "1 figure collected" : `${minifigures} figures collected`;
  document.querySelector("#item-detail").textContent = total ? "Keep building your story" : "Your collection is ready";
  document.querySelector("#collection-message").textContent = total ? `${total} item${total === 1 ? "" : "s"} catalogued and counting.` : "Add your first item to begin.";
  document.querySelector("#collector-level").textContent = `Level ${levelIndex + 1} · ${level.name}`;
  document.querySelector("#level-count").textContent = next ? `${total} / ${next.at}` : `${total} items`;
  document.querySelector("#level-progress").style.width = `${Math.min(progress, 100)}%`;
  document.querySelector("#next-milestone").textContent = next ? `${next.at - total} item${next.at - total === 1 ? "" : "s"} until ${next.name}` : "Highest collector level reached";

  const setPercent = total ? Math.round((sets / total) * 100) : 0;
  const minifigurePercent = total ? 100 - setPercent : 0;
  document.querySelector("#set-mix").textContent = `${setPercent}%`;
  document.querySelector("#minifigure-mix").textContent = `${minifigurePercent}%`;
  document.querySelector("#mix-donut").innerHTML = `${total}<small> items</small>`;
  document.querySelector("#mix-donut").style.background = total ? `conic-gradient(#147a47 0 ${setPercent}%, #e8b84c ${setPercent}% 100%)` : "#edf2ee";
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
  document.querySelectorAll(".chart-period").forEach((button) => button.classList.toggle("active", button.dataset.period === period));
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
  })).map((point) => ({
    x: point.x,
    y: 255 - ((point.value - min) / range) * 230,
  }));
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

async function deleteItem(item) {
  if (!window.confirm(`Remove ${item.name} from your collection?`)) return;
  const { error } = await window.supabaseClient.from("collection_items").delete().eq("id", item.id);
  if (error) return showToast(`Could not remove: ${error.message}`);
  collection = collection.filter((entry) => entry.id !== item.id);
  await loadHistory();
  renderCollection();
  showToast("Item removed from your collection.");
}

function renderCollection() {
  holdingsList.replaceChildren();
  if (!collection.length) {
    const empty = document.createElement("div");
    empty.className = "empty-collection";
    empty.innerHTML = "<strong>Your collection starts here</strong><span>Search for a set or minifigure and add your first item.</span>";
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
      const name = document.createElement("strong");
      name.textContent = item.name;
      const meta = document.createElement("small");
      meta.textContent = `${item.item_type === "minifigure" ? "Minifigure" : "Set"} ${item.item_number}${item.year ? ` · ${item.year}` : ""}`;
      description.append(name, meta);
      const value = document.createElement("div");
      value.className = "value";
      const amount = document.createElement("strong");
      amount.textContent = price(item.estimated_value);
      const added = document.createElement("small");
      const itemCost = Number(item.purchase_price || 0);
      const itemGain = Number(item.estimated_value || 0) - itemCost;
      const itemGainPercent = itemCost > 0 ? (itemGain / itemCost) * 100 : 0;
      added.className = itemGain >= 0 ? "positive" : "negative";
      added.textContent = `${itemGain >= 0 ? "+" : "−"}${price(Math.abs(itemGain))} (${itemGain >= 0 ? "+" : "−"}${Math.abs(itemGainPercent).toFixed(1)}%)`;
      value.append(amount, added);
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
    holdingsList.innerHTML = `<div class="empty-collection"><strong>Collection could not load</strong><span>${error.message}</span></div>`;
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

document.querySelector("#image-close").addEventListener("click", () => imageDialog.close());
imagePrevious.addEventListener("click", () => moveGallery(-1));
imageNext.addEventListener("click", () => moveGallery(1));
galleryImage.addEventListener("click", () => moveGallery(1));
imageDialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") moveGallery(-1);
  if (event.key === "ArrowRight") moveGallery(1);
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
const chartButton = document.querySelector("#open-chart");
const chartDialog = document.querySelector("#chart-dialog");
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
document.querySelectorAll(".chart-period").forEach((button) => button.addEventListener("click", () => renderDetailedChart(button.dataset.period)));
document.querySelector("#sign-out").addEventListener("click", async () => {
  await window.supabaseClient.auth.signOut();
  window.location.replace("index.html");
});

async function initialize() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) return window.location.replace("index.html");
  currentUser = session.user;
  const username = currentUser.user_metadata.username || currentUser.email.split("@")[0];
  document.querySelector("#profile-name").textContent = username;
  document.querySelector("#welcome-message").textContent = `Good afternoon, ${username}.`;
  document.querySelector(".avatar").textContent = username.slice(0, 2).toUpperCase();
  const { data: isAdmin } = await window.supabaseClient.rpc("is_admin");
  document.querySelector("#admin-nav-link").hidden = !isAdmin;
  renderWatchlist();
  await loadCollection();
}

initialize();

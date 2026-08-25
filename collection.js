let collection = [];
let currentUser = null;
let toastTimer;

const dialog = document.querySelector("#dialog");
const form = dialog.querySelector("form");
const lookupButton = document.querySelector("#lookup-set");
const saveButton = document.querySelector("#save-set");
const searchInput = document.querySelector("#set-number");
const lookupResult = document.querySelector("#lookup-result");
const lookupResults = document.querySelector("#lookup-results");
const nameInput = document.querySelector("#new-name");
const valueInput = document.querySelector("#new-value");
const holdingsList = document.querySelector("#holdings-list");
const addButton = document.querySelector("#add-set");
const price = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);

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
  const best = collection.reduce((winner, item) => !winner || Number(item.estimated_value) > Number(winner.estimated_value) ? item : winner, null);
  let levelIndex = levels.findLastIndex((level) => total >= level.at);
  if (levelIndex < 0) levelIndex = 0;
  const level = levels[levelIndex];
  const next = levels[levelIndex + 1];
  const progress = next ? ((total - level.at) / (next.at - level.at)) * 100 : 100;

  document.querySelector("#total-value").textContent = price(totalValue);
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
}

function makeAction(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `item-action ${className}`;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

async function editItem(item) {
  const answer = window.prompt(`Update the estimated value for ${item.name}:`, Number(item.estimated_value).toFixed(2));
  if (answer === null) return;
  const estimatedValue = Number(answer);
  if (!Number.isFinite(estimatedValue) || estimatedValue < 0) {
    showToast("Enter a valid value of 0 or more.");
    return;
  }
  const { error } = await window.supabaseClient.from("collection_items").update({ estimated_value: estimatedValue }).eq("id", item.id);
  if (error) return showToast(`Could not update: ${error.message}`);
  item.estimated_value = estimatedValue;
  renderCollection();
  showToast("Value updated.");
}

async function deleteItem(item) {
  if (!window.confirm(`Remove ${item.name} from your collection?`)) return;
  const { error } = await window.supabaseClient.from("collection_items").delete().eq("id", item.id);
  if (error) return showToast(`Could not remove: ${error.message}`);
  collection = collection.filter((entry) => entry.id !== item.id);
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
      added.textContent = `Added ${new Date(item.created_at).toLocaleDateString()}`;
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
  const { data, error } = await window.supabaseClient.from("collection_items").select("*").order("created_at", { ascending: false });
  if (error) {
    holdingsList.innerHTML = `<div class="empty-collection"><strong>Collection could not load</strong><span>${error.message}</span></div>`;
    return;
  }
  collection = data || [];
  renderCollection();
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
    number: item.set_num || item.fig_num || item.minifig_num || item.number || item.id || "",
    type,
    image: item.set_img_url || item.img_big || item.img_sm || item.img_tn || item.image_url || item.image || "",
    year: item.year || "",
    pieces: item.num_parts || item.pieces || "",
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
    meta.textContent = details.type === "minifigure" ? `Minifigure · ${details.number}` : `Set ${details.number}${details.year ? ` · ${details.year}` : ""}`;
    text.append(name, meta);
    button.append(image, text);
    button.addEventListener("click", () => {
      lookupResults.querySelectorAll("button").forEach((result) => result.classList.remove("selected"));
      button.classList.add("selected");
      nameInput.value = details.name;
      searchInput.dataset.itemNumber = details.number;
      searchInput.dataset.itemType = details.type;
      searchInput.dataset.imageUrl = details.image;
      searchInput.dataset.year = details.year;
      searchInput.dataset.pieces = details.pieces;
      lookupResult.textContent = `Selected: ${details.name}`;
      saveButton.disabled = false;
      valueInput.focus();
    });
    lookupResults.append(button);
  });
  lookupResults.hidden = false;
}

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
  if (!nameInput.value || !Number.isFinite(estimatedValue) || estimatedValue < 0) return;
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  const item = {
    user_id: currentUser.id,
    item_number: searchInput.dataset.itemNumber || searchInput.value.trim(),
    name: nameInput.value.trim(),
    item_type: searchInput.dataset.itemType || "set",
    estimated_value: estimatedValue,
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
  renderCollection();
  dialog.close();
  addButton.classList.add("celebrate");
  setTimeout(() => addButton.classList.remove("celebrate"), 500);
  const total = collection.length;
  showToast(total === 5 || total === 15 || total === 30 || total === 60 ? `Level up! ${data.name} unlocked a new collector level.` : `${data.name} added. Collection: ${total} item${total === 1 ? "" : "s"}.`);
});

addButton.addEventListener("click", openDialog);
document.querySelector("#add-from-empty").addEventListener("click", openDialog);
document.querySelector("#cancel-add").addEventListener("click", () => { resetDialog(); dialog.close("cancel"); });
dialog.addEventListener("cancel", resetDialog);
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
  renderWatchlist();
  await loadCollection();
}

initialize();

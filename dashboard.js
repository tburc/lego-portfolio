const holdings = [
  ["The Lord of the Rings: Rivendell™", "10316", 499.99, "+42.9%", "🌲"],
  ["Republic Gunship™", "75309", 328.5, "+31.4%", "🚀"],
  ["The Razor Crest™", "75292", 184.95, "+42.3%", "✦"],
  ["Lion Knights' Castle", "10305", 399.99, "0.0%", "♜"],
];

async function loadSignedInUser() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();

  if (!session) {
    window.location.replace("index.html");
    return;
  }

  const username = session.user.user_metadata.username || session.user.email.split("@")[0];
  document.querySelector("#profile-name").textContent = username;
  document.querySelector("#welcome-message").textContent = `Good afternoon, ${username}.`;
}
const watchlist = [["The Milky Way Galaxy", "$164.99", "+8.4%"], ["Medieval Town Square", "$229.99", "+4.1%"], ["Wolfpack Beastmaster", "$18.50", "−2.2%"]];
const price = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
function render() {
  document.querySelector("#holdings-list").innerHTML = holdings.map(([name, number, value, change, icon, type = "set"]) => `<article class="holding"><span class="tile">${icon}</span><div><strong>${name}</strong><small>${type === "minifigure" ? "Minifigure" : "Set"} ${number} · Sealed</small></div><div class="value"><strong>${price(value)}</strong><small class="${change === "0.0%" ? "" : "positive"}">${change}</small></div></article>`).join("");
  document.querySelector("#watchlist-list").innerHTML = watchlist.map(([name, value, change]) => `<article class="watch"><div><strong>${name}</strong><small>Watchlisted set</small></div><div><strong>${value}</strong><small class="${change.includes("−") ? "negative" : "positive"}">${change}</small></div></article>`).join("");
  document.querySelector("#set-count").textContent = holdings.length + 8;
  document.querySelector("#total-value").textContent = price(1434.07 + holdings.reduce((sum, item) => sum + item[2], 0));
}
const dialog = document.querySelector("#dialog");
const lookupButton = document.querySelector("#lookup-set");
const saveSetButton = document.querySelector("#save-set");
const setNumberInput = document.querySelector("#set-number");
const lookupResult = document.querySelector("#lookup-result");
document.querySelector("#add-set").addEventListener("click", () => dialog.showModal());
const lookupResults = document.querySelector("#lookup-results");
document.querySelector("#cancel-add").addEventListener("click", () => {
  dialog.querySelector("form").reset();
  lookupResults.replaceChildren();
  lookupResults.hidden = true;
  lookupResult.textContent = "";
  delete setNumberInput.dataset.setNumber;
  delete setNumberInput.dataset.itemType;
  saveSetButton.disabled = true;
  dialog.close("cancel");
});

const searchItems = (data) => {
  if (Array.isArray(data)) return data;
  const grouped = ["results", "items", "sets", "minifigures", "minifigs"]
    .flatMap((key) => Array.isArray(data?.[key]) ? data[key] : []);
  return grouped.length ? grouped : (data && !data.error ? [data] : []);
};

const searchItemDetails = (item) => {
  const type = item.type || item.item_type || (item.fig_num || item.minifig_num ? "minifigure" : "set");
  const number = item.set_num || item.fig_num || item.minifig_num || item.number || item.id || "";
  return {
    name: item.name || item.descr || "Unnamed LEGO item",
    number,
    type,
    image: item.set_img_url || item.img_big || item.img_sm || item.img_tn || item.image_url || item.image,
    meta: type === "minifigure" ? `Minifigure · ${number}` : `Set ${number}${item.year ? ` · ${item.year}` : ""}`,
  };
};

function showSearchItems(items) {
  lookupResults.replaceChildren();
  items.forEach((item) => {
    const details = searchItemDetails(item);
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
    meta.textContent = details.meta;
    text.append(name, meta);
    button.append(image, text);
    button.addEventListener("click", () => {
      lookupResults.querySelectorAll("button").forEach((result) => result.classList.remove("selected"));
      button.classList.add("selected");
      document.querySelector("#new-name").value = details.name;
      setNumberInput.dataset.setNumber = details.number;
      setNumberInput.dataset.itemType = details.type;
      lookupResult.textContent = `Selected: ${details.name} · ${details.meta}`;
      saveSetButton.disabled = false;
    });
    lookupResults.append(button);
  });
  lookupResults.hidden = false;
}

lookupButton.addEventListener("click", async () => {
  const query = setNumberInput.value.trim();
  if (!query) {
    lookupResult.textContent = "Enter a set or minifigure name or number.";
    return;
  }
  lookupButton.disabled = true;
  lookupButton.textContent = "Searching...";
  lookupResult.textContent = "";
  lookupResults.hidden = true;
  saveSetButton.disabled = true;
  try {
    const { data, error } = await window.supabaseClient.functions.invoke("lookup-set", {
      body: { query, setNumber: query, includeMinifigures: true, limit: 20 },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const items = searchItems(data).slice(0, 20);
    if (!items.length) throw new Error("No matching sets or minifigures found.");
    showSearchItems(items);
    lookupResult.textContent = `${items.length} result${items.length === 1 ? "" : "s"} found. Select one to add.`;
    if (items.length === 1) lookupResults.firstElementChild.click();
  } catch (error) {
    lookupResult.textContent = error.message || "We could not find a matching LEGO item.";
  } finally {
    lookupButton.disabled = false;
    lookupButton.textContent = "Search LEGO";
  }
});

document.querySelector("#save-set").addEventListener("click", () => {
  const name = document.querySelector("#new-name").value.trim();
  const value = Number(document.querySelector("#new-value").value);
  const number = setNumberInput.dataset.setNumber || setNumberInput.value.trim();
  const type = setNumberInput.dataset.itemType || "set";
  if (name && Number.isFinite(value) && value >= 0) {
    holdings.unshift([name, number, value, "0.0%", "◆"]);
    holdings[0][5] = type;
    render();
  }
});
document.querySelector("#sign-out").addEventListener("click", async () => {
  await window.supabaseClient.auth.signOut();
  window.location.replace("index.html");
});
render();
loadSignedInUser();

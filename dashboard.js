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
  document.querySelector("#holdings-list").innerHTML = holdings.map(([name, number, value, change, icon]) => `<article class="holding"><span class="tile">${icon}</span><div><strong>${name}</strong><small>Set ${number} · Sealed</small></div><div class="value"><strong>${price(value)}</strong><small class="${change === "0.0%" ? "" : "positive"}">${change}</small></div></article>`).join("");
  document.querySelector("#watchlist-list").innerHTML = watchlist.map(([name, value, change]) => `<article class="watch"><div><strong>${name}</strong><small>Watchlisted set</small></div><div><strong>${value}</strong><small class="${change.includes("−") ? "negative" : "positive"}">${change}</small></div></article>`).join("");
  document.querySelector("#set-count").textContent = holdings.length + 8;
  document.querySelector("#total-value").textContent = price(1434.07 + holdings.reduce((sum, item) => sum + item[2], 0));
}
const dialog = document.querySelector("#dialog");
const lookupButton = document.querySelector("#lookup-set");
const saveSetButton = document.querySelector("#save-set");
const setNumberInput = document.querySelector("#set-number");
const lookupResult = document.querySelector("#lookup-result");
const lookupPreview = document.querySelector("#lookup-preview");
const lookupImage = document.querySelector("#lookup-image");
document.querySelector("#add-set").addEventListener("click", () => dialog.showModal());
lookupButton.addEventListener("click", async () => {
  const setNumber = setNumberInput.value.trim();
  if (!setNumber) {
    lookupResult.textContent = "Enter a set number first.";
    return;
  }

  lookupButton.disabled = true;
  lookupButton.textContent = "Searching…";
  lookupResult.textContent = "";
  lookupPreview.hidden = true;
  saveSetButton.disabled = true;

  try {
    const { data, error } = await window.supabaseClient.functions.invoke("lookup-set", {
      body: { setNumber },
    });
    if (error) throw error;
    if (data.error) throw new Error(data.error);

    document.querySelector("#new-name").value = data.name || data.descr || "Unnamed set";
    setNumberInput.dataset.setNumber = data.set_num || setNumber;
    const imageUrl = data.set_img_url || data.img_big || data.img_sm || data.img_tn;
    if (imageUrl) {
      lookupImage.src = imageUrl;
      lookupImage.alt = `${data.name || data.descr || "LEGO set"} product image`;
      lookupPreview.hidden = false;
    }
    lookupResult.textContent = `Found: ${data.name || data.descr} · ${data.year || "Year unknown"} · ${data.num_parts || data.pieces || "?"} pieces`;
    saveSetButton.disabled = false;
  } catch (error) {
    lookupResult.textContent = error.message || "We could not find that set.";
  } finally {
    lookupButton.disabled = false;
    lookupButton.textContent = "Search set";
  }
});
document.querySelector("#save-set").addEventListener("click", () => {
  const name = document.querySelector("#new-name").value.trim();
  const value = Number(document.querySelector("#new-value").value);
  const number = setNumberInput.dataset.setNumber || setNumberInput.value.trim();
  if (name && Number.isFinite(value) && value >= 0) {
    holdings.unshift([name, number, value, "0.0%", "◆"]);
    render();
  }
});
document.querySelector("#sign-out").addEventListener("click", async () => {
  await window.supabaseClient.auth.signOut();
  window.location.replace("index.html");
});
render();
loadSignedInUser();

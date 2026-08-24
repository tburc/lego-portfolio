const holdings = [
  ["The Lord of the Rings: Rivendell™", "10316", 499.99, "+42.9%", "🌲"],
  ["Republic Gunship™", "75309", 328.5, "+31.4%", "🚀"],
  ["The Razor Crest™", "75292", 184.95, "+42.3%", "✦"],
  ["Lion Knights' Castle", "10305", 399.99, "0.0%", "♜"],
];
const watchlist = [["The Milky Way Galaxy", "$164.99", "+8.4%"], ["Medieval Town Square", "$229.99", "+4.1%"], ["Wolfpack Beastmaster", "$18.50", "−2.2%"]];
const price = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
function render() {
  document.querySelector("#holdings-list").innerHTML = holdings.map(([name, number, value, change, icon]) => `<article class="holding"><span class="tile">${icon}</span><div><strong>${name}</strong><small>Set ${number} · Sealed</small></div><div class="value"><strong>${price(value)}</strong><small class="${change === "0.0%" ? "" : "positive"}">${change}</small></div></article>`).join("");
  document.querySelector("#watchlist-list").innerHTML = watchlist.map(([name, value, change]) => `<article class="watch"><div><strong>${name}</strong><small>Watchlisted set</small></div><div><strong>${value}</strong><small class="${change.includes("−") ? "negative" : "positive"}">${change}</small></div></article>`).join("");
  document.querySelector("#set-count").textContent = holdings.length + 8;
  document.querySelector("#total-value").textContent = price(1434.07 + holdings.reduce((sum, item) => sum + item[2], 0));
}
const dialog = document.querySelector("#dialog");
document.querySelector("#add-set").addEventListener("click", () => dialog.showModal());
document.querySelector("#save-set").addEventListener("click", () => { const name = document.querySelector("#new-name").value.trim(); const value = Number(document.querySelector("#new-value").value); if (name && value >= 0) { holdings.unshift([name, "New", value, "0.0%", "◆"]); render(); } });
render();

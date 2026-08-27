const PAGE_SIZE = 24;

const productGrid = document.querySelector("#product-grid");
const cardTemplate = document.querySelector("#product-card-template");
const resultCount = document.querySelector("#result-count");
const emptyState = document.querySelector("#empty-state");
const catalogError = document.querySelector("#catalog-error");
const pagination = document.querySelector("#pagination");
const pageStatus = document.querySelector("#page-status");
const previousPage = document.querySelector("#previous-page");
const nextPage = document.querySelector("#next-page");
const searchInput = document.querySelector("#catalog-search");
const themeFilter = document.querySelector("#theme-filter");
const yearFilter = document.querySelector("#year-filter");
const sortFilter = document.querySelector("#sort-filter");
const clearFiltersButton = document.querySelector("#clear-filters");
const addDialog = document.querySelector("#add-dialog");
const addForm = document.querySelector("#add-form");
const addSetName = document.querySelector("#add-set-name");
const addPriceStatus = document.querySelector("#add-price-status");
const addPurchasePrice = document.querySelector("#add-purchase-price");
const addCurrentValue = document.querySelector("#add-current-value");
const saveAddButton = document.querySelector("#save-add");
const catalogToast = document.querySelector("#catalog-toast");

let currentPage = 1;
let totalProducts = 0;
let searchTimer;
let currentUser = null;
let selectedProduct = null;
let toastTimer;

function showToast(message) {
  clearTimeout(toastTimer);
  catalogToast.textContent = message;
  catalogToast.classList.add("show");
  toastTimer = setTimeout(() => catalogToast.classList.remove("show"), 2800);
}

async function openAddDialog(product) {
  if (!currentUser) {
    catalogError.textContent = "Sign in first, then you can add sets directly to your portfolio.";
    document.querySelector("#account-link").focus();
    return;
  }
  selectedProduct = product;
  addSetName.textContent = product.name;
  addPurchasePrice.value = "";
  addCurrentValue.value = "";
  addPriceStatus.textContent = "Checking the original U.S. retail price…";
  addDialog.showModal();

  try {
    const { data, error } = await window.supabaseClient.functions.invoke("lookup-set", {
      body: { query: product.set_num, includeMinifigures: false, limit: 5 },
    });
    if (error || data?.error) throw new Error(data?.error || error.message);
    const match = (data?.results || []).find((item) => item.set_num === product.set_num);
    const retailPrice = Number(match?.retail_price);
    if (Number.isFinite(retailPrice) && retailPrice > 0) {
      addPurchasePrice.value = retailPrice.toFixed(2);
      addCurrentValue.value = retailPrice.toFixed(2);
      addPriceStatus.textContent = "Original U.S. retail price filled from Brickset. Change it if you paid a different amount.";
    } else {
      addPriceStatus.textContent = "No original retail price was found. Enter what you paid and its current value.";
    }
  } catch {
    addPriceStatus.textContent = "Price lookup is unavailable. You can still enter both values manually.";
  }
}

function safeSearchTerm(value) {
  return value.trim().slice(0, 80).replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

function renderSkeletons() {
  productGrid.replaceChildren();
  for (let index = 0; index < 8; index += 1) {
    const skeleton = document.createElement("article");
    skeleton.className = "product-card skeleton-card";
    skeleton.innerHTML = '<div class="skeleton-image"></div><div class="skeleton-lines"><span></span><span></span><span></span></div>';
    productGrid.append(skeleton);
  }
}

function renderProducts(products) {
  productGrid.replaceChildren();

  products.forEach((product) => {
    const card = cardTemplate.content.cloneNode(true);
    const imageLink = card.querySelector(".product-image-link");
    const titleLink = card.querySelector("h2 a");
    const image = card.querySelector("img");

    imageLink.href = product.source_url;
    titleLink.href = product.source_url;
    titleLink.textContent = product.name;
    image.src = product.image_url;
    image.alt = `${product.name} LEGO set`;
    image.addEventListener("error", () => image.closest(".product-image-link").classList.add("image-missing"));
    card.querySelector(".featured-badge").hidden = !product.is_featured;
    card.querySelector(".set-number").textContent = `Set ${product.set_num}`;
    card.querySelector(".theme-name").textContent = product.theme?.name || "Other";
    card.querySelector(".set-year").textContent = product.year;
    card.querySelector(".piece-count").textContent = Number(product.num_parts).toLocaleString();
    card.querySelector(".add-to-portfolio").addEventListener("click", () => openAddDialog(product));
    productGrid.append(card);
  });
}

function updateFilterState() {
  const hasFilters = Boolean(searchInput.value.trim() || themeFilter.value || yearFilter.value || sortFilter.value !== "featured");
  clearFiltersButton.hidden = !hasFilters;
}

function updatePagination() {
  const pageCount = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
  previousPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= pageCount;
  pageStatus.textContent = `Page ${currentPage} of ${pageCount}`;
  pagination.hidden = totalProducts <= PAGE_SIZE;
}

async function loadProducts() {
  productGrid.setAttribute("aria-busy", "true");
  catalogError.textContent = "";
  emptyState.hidden = true;
  renderSkeletons();

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = window.supabaseClient
    .from("lego_sets")
    .select(
      "set_num,name,year,num_parts,image_url,source_url,is_featured,display_order,theme:lego_themes(name)",
      { count: "exact" },
    );

  const search = safeSearchTerm(searchInput.value);
  if (search) query = query.or(`name.ilike.%${search}%,set_num.ilike.%${search}%`);
  if (themeFilter.value) query = query.eq("theme_id", Number(themeFilter.value));
  if (yearFilter.value) query = query.eq("year", Number(yearFilter.value));

  if (sortFilter.value === "newest") {
    query = query.order("year", { ascending: false }).order("name");
  } else if (sortFilter.value === "pieces") {
    query = query.order("num_parts", { ascending: false }).order("name");
  } else if (sortFilter.value === "name") {
    query = query.order("name");
  } else {
    query = query
      .order("is_featured", { ascending: false })
      .order("display_order")
      .order("year", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  productGrid.setAttribute("aria-busy", "false");

  if (error) {
    productGrid.replaceChildren();
    resultCount.textContent = "Products unavailable";
    catalogError.textContent = `The product catalog could not load: ${error.message}`;
    pagination.hidden = true;
    return;
  }

  totalProducts = count || 0;
  const lastShown = Math.min(from + data.length, totalProducts);
  resultCount.textContent = totalProducts
    ? `Showing ${from + 1}–${lastShown} of ${totalProducts} products`
    : "0 products";
  renderProducts(data);
  emptyState.hidden = data.length > 0;
  updateFilterState();
  updatePagination();
}

async function loadFilterOptions() {
  const { data: catalogRows, error } = await window.supabaseClient
    .from("lego_sets")
    .select("theme_id,year")
    .limit(1000);

  if (error || !catalogRows) return;

  const themeIds = [...new Set(catalogRows.map((row) => row.theme_id).filter(Boolean))];
  const years = [...new Set(catalogRows.map((row) => row.year))].sort((left, right) => right - left);
  const { data: themes } = await window.supabaseClient
    .from("lego_themes")
    .select("id,name")
    .in("id", themeIds)
    .order("name");

  (themes || []).forEach((theme) => {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    themeFilter.append(option);
  });

  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    yearFilter.append(option);
  });
}

function resetFilters() {
  searchInput.value = "";
  themeFilter.value = "";
  yearFilter.value = "";
  sortFilter.value = "featured";
  currentPage = 1;
  loadProducts();
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage = 1;
    loadProducts();
  }, 300);
});

[themeFilter, yearFilter, sortFilter].forEach((filter) => {
  filter.addEventListener("change", () => {
    currentPage = 1;
    loadProducts();
  });
});

clearFiltersButton.addEventListener("click", resetFilters);
document.querySelector("#empty-clear").addEventListener("click", resetFilters);
previousPage.addEventListener("click", () => {
  currentPage -= 1;
  loadProducts().then(() => window.scrollTo({ top: 390, behavior: "smooth" }));
});
nextPage.addEventListener("click", () => {
  currentPage += 1;
  loadProducts().then(() => window.scrollTo({ top: 390, behavior: "smooth" }));
});

document.querySelector("#close-add").addEventListener("click", () => addDialog.close());
document.querySelector("#cancel-add").addEventListener("click", () => addDialog.close());
addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || !selectedProduct) return;
  const purchasePrice = Number(addPurchasePrice.value);
  const estimatedValue = Number(addCurrentValue.value);
  if (![purchasePrice, estimatedValue].every((value) => Number.isFinite(value) && value >= 0)) return;

  saveAddButton.disabled = true;
  saveAddButton.textContent = "Adding…";
  const { error } = await window.supabaseClient.from("collection_items").insert({
    user_id: currentUser.id,
    item_number: selectedProduct.set_num,
    name: selectedProduct.name,
    item_type: "set",
    estimated_value: estimatedValue,
    purchase_price: purchasePrice,
    image_url: selectedProduct.image_url || null,
    year: Number(selectedProduct.year) || null,
    pieces: Number(selectedProduct.num_parts) || null,
  });
  saveAddButton.disabled = false;
  saveAddButton.textContent = "Add item";
  if (error) {
    addPriceStatus.textContent = `Could not add this set: ${error.message}`;
    return;
  }
  addDialog.close();
  showToast(`${selectedProduct.name} was added to your portfolio.`);
});

async function initialize() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    const accountLink = document.querySelector("#account-link");
    accountLink.href = "dashboard.html";
    accountLink.textContent = "My portfolio";
  }

  await Promise.all([loadFilterOptions(), loadProducts()]);
}

initialize();

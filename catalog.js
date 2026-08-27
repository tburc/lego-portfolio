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
const previewDialog = document.querySelector("#preview-dialog");
const previewImage = document.querySelector("#preview-image");
const previewName = document.querySelector("#preview-name");
const previewMeta = document.querySelector("#preview-meta");
const previewBricksetLink = document.querySelector("#preview-brickset-link");

let currentPage = 1;
let totalProducts = 0;
let searchTimer;
let currentUser = null;
let selectedProduct = null;
let toastTimer;
let loadSequence = 0;
let allThemesPromise;
const retailPrices = new Map();
let retailPriceRequest = Promise.resolve();

function showPreview(product) {
  previewImage.src = product.image_url || "";
  previewImage.alt = `${product.name} LEGO set`;
  previewName.textContent = product.name;
  previewMeta.textContent = `Set ${product.set_num} · ${product.year} · ${Number(product.num_parts).toLocaleString()} pieces`;
  previewBricksetLink.href = `https://brickset.com/sets/${encodeURIComponent(product.set_num)}`;
  previewDialog.showModal();
}

const compactSearch = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

async function categoryThemeIds(search) {
  const aliases = {
    mincraft: "minecraft",
    minecarft: "minecraft",
    minecraf: "minecraft",
    starwar: "starwars",
  };
  const compact = aliases[compactSearch(search)] || compactSearch(search);
  if (!compact) return [];
  allThemesPromise ||= window.supabaseClient.from("lego_themes").select("id,name,parent_id").limit(2000);
  const { data: themes, error } = await allThemesPromise;
  if (error || !themes) return [];
  const roots = themes.filter((theme) => compactSearch(theme.name) === compact).map((theme) => theme.id);
  if (!roots.length) return [];
  const ids = new Set(roots);
  let added = true;
  while (added) {
    added = false;
    themes.forEach((theme) => {
      if (theme.parent_id && ids.has(theme.parent_id) && !ids.has(theme.id)) {
        ids.add(theme.id);
        added = true;
      }
    });
  }
  return [...ids];
}

async function loadCategory(search, sequence) {
  const themeIds = await categoryThemeIds(search);
  if (!themeIds.length || sequence !== loadSequence) return false;
  const { data, error, count } = await window.supabaseClient
    .from("lego_sets")
    .select(
      "set_num,name,year,num_parts,image_url,source_url,is_featured,display_order,theme:lego_themes(name)",
      { count: "exact" },
    )
    .in("theme_id", themeIds)
    .order("year", { ascending: false })
    .order("name")
    .range(0, PAGE_SIZE - 1);
  if (sequence !== loadSequence) return true;
  if (error) throw error;
  totalProducts = count || 0;
  resultCount.textContent = `Showing ${data.length} of ${totalProducts} sets in this LEGO theme`;
  renderProducts(data);
  retailPriceRequest = loadRetailPrices(data);
  emptyState.hidden = data.length > 0;
  pagination.hidden = true;
  updateFilterState();
  productGrid.setAttribute("aria-busy", "false");
  return true;
}

async function loadRetailPrices(products) {
  const setNumbers = products.map((product) => product.set_num).filter(Boolean);
  if (!setNumbers.length) return;
  try {
    const { data, error } = await window.supabaseClient.functions.invoke("brickset-prices", { body: { setNumbers } });
    if (error || data?.error) throw new Error(data?.error || error.message);
    (data.results || []).forEach((item) => retailPrices.set(item.set_num, Number(item.retail_price) || null));
  } catch {
    setNumbers.forEach((setNumber) => retailPrices.set(setNumber, null));
  }
  productGrid.querySelectorAll(".product-card").forEach((card) => {
    const setNumber = card.dataset.setNumber;
    const value = retailPrices.get(setNumber);
    card.querySelector(".retail-price").textContent = value ? `$${value.toFixed(2)}` : "Not available";
  });
}

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
  await retailPriceRequest;
  selectedProduct = product;
  addSetName.textContent = product.name;
  addPurchasePrice.value = "";
  addCurrentValue.value = "";
  const retailPrice = retailPrices.get(product.set_num);
  if (retailPrice) {
    addPurchasePrice.value = retailPrice.toFixed(2);
    addCurrentValue.value = retailPrice.toFixed(2);
    addPriceStatus.textContent = "Original U.S. retail price filled from Brickset. Change it if you paid a different amount.";
  } else {
    addPriceStatus.textContent = "No original retail price was found. Enter what you paid and its current value.";
  }
  addDialog.showModal();
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
    const titleLink = card.querySelector(".product-title");
    const image = card.querySelector("img");

    titleLink.textContent = product.name;
    image.src = product.image_url;
    image.alt = `${product.name} LEGO set`;
    image.addEventListener("error", () => image.closest(".product-image-link").classList.add("image-missing"));
    card.querySelector(".featured-badge").hidden = !product.is_featured;
    card.querySelector(".set-number").textContent = `Set ${product.set_num}`;
    card.querySelector(".theme-name").textContent = product.theme?.name || "Other";
    card.querySelector(".set-year").textContent = product.year;
    card.querySelector(".piece-count").textContent = Number(product.num_parts).toLocaleString();
    card.querySelector(".product-card").dataset.setNumber = product.set_num;
    imageLink.addEventListener("click", () => showPreview(product));
    titleLink.addEventListener("click", () => showPreview(product));
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
  const sequence = ++loadSequence;
  productGrid.setAttribute("aria-busy", "true");
  catalogError.textContent = "";
  emptyState.hidden = true;
  renderSkeletons();

  const search = safeSearchTerm(searchInput.value);
  if (search) {
    try {
      if (await loadCategory(search, sequence)) return;
    } catch (error) {
      if (sequence !== loadSequence) return;
      catalogError.textContent = `Theme search could not load: ${error.message}`;
    }
    const { data, error } = await window.supabaseClient.functions.invoke("lookup-set", {
      body: { query: search, includeMinifigures: false, limit: 20 },
    });
    if (sequence !== loadSequence) return;
    productGrid.setAttribute("aria-busy", "false");
    if (error || data?.error) {
      productGrid.replaceChildren();
      resultCount.textContent = "Search unavailable";
      catalogError.textContent = `LEGO search could not load: ${data?.error || error.message}`;
      pagination.hidden = true;
      return;
    }
    const products = (data?.results || [])
      .filter((item) => item.type === "set")
      .map((item) => {
        const retailPrice = Number(item.retail_price) || null;
        retailPrices.set(item.set_num, retailPrice);
        return {
          set_num: item.set_num,
          name: item.name,
          year: item.year,
          num_parts: item.num_parts,
          image_url: item.set_img_url,
          source_url: `https://rebrickable.com/sets/${encodeURIComponent(item.set_num)}/`,
          is_featured: false,
          theme: { name: "LEGO catalog" },
        };
      });
    totalProducts = products.length;
    resultCount.textContent = `${products.length} matching set${products.length === 1 ? "" : "s"} from the wider LEGO catalog`;
    renderProducts(products);
    productGrid.querySelectorAll(".product-card").forEach((card) => {
      const value = retailPrices.get(card.dataset.setNumber);
      card.querySelector(".retail-price").textContent = value ? `$${value.toFixed(2)}` : "Not available";
    });
    emptyState.hidden = products.length > 0;
    pagination.hidden = true;
    updateFilterState();
    return;
  }

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = window.supabaseClient
    .from("lego_sets")
    .select(
      "set_num,name,year,num_parts,image_url,source_url,is_featured,display_order,theme:lego_themes(name)",
      { count: "exact" },
    );

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
  if (sequence !== loadSequence) return;
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
  retailPriceRequest = loadRetailPrices(data);
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
document.querySelector("#close-preview").addEventListener("click", () => previewDialog.close());
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

const views = {
  loading: document.querySelector("#loading-view"),
  login: document.querySelector("#login-view"),
  denied: document.querySelector("#denied-view"),
  admin: document.querySelector("#admin-view"),
};

const loginForm = document.querySelector("#admin-login-form");
const emailInput = document.querySelector("#admin-email");
const passwordInput = document.querySelector("#admin-password");
const loginButton = document.querySelector("#admin-login-button");
const loginNotice = document.querySelector("#login-notice");
const adminNotice = document.querySelector("#admin-notice");

function showView(viewName) {
  Object.entries(views).forEach(([name, element]) => {
    element.hidden = name !== viewName;
  });
}

function formatDate(value) {
  if (!value) return "No signups yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);
}

async function checkAdminAccess(user) {
  const { data, error } = await window.supabaseClient.rpc("is_admin");
  if (error) throw error;

  if (!data) {
    document.querySelector("#denied-message").textContent =
      `${user.email || "This signed-in account"} has regular member access.`;
    showView("denied");
    return;
  }

  document.querySelector("#admin-identity").textContent = `Signed in as ${user.email}`;
  showView("admin");
  await loadOverview();
}

async function loadOverview() {
  adminNotice.textContent = "";
  const { data, error } = await window.supabaseClient.rpc("get_admin_overview");

  if (error) {
    adminNotice.textContent = `Admin access was verified, but the overview could not load: ${error.message}`;
    return;
  }

  document.querySelector("#total-users").textContent = Number(data.total_users).toLocaleString();
  document.querySelector("#total-items").textContent = Number(data.total_collection_items).toLocaleString();
  document.querySelector("#active-collectors").textContent = Number(data.active_collectors).toLocaleString();
  document.querySelector("#tracked-value").textContent = formatCurrency(data.total_collection_value);
  document.querySelector("#catalog-products").textContent = Number(data.catalog_products || 0).toLocaleString();
  document.querySelector("#latest-user").textContent = formatDate(data.latest_user_at);
  await loadAdminProducts();
}

function safeSearchTerm(value) {
  return value.trim().slice(0, 80).replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

async function loadAdminProducts() {
  const list = document.querySelector("#admin-product-list");
  const status = document.querySelector("#admin-list-status");
  const search = safeSearchTerm(document.querySelector("#admin-product-search").value);
  list.innerHTML = `<div class="admin-list-skeleton" aria-hidden="true">${Array.from({ length: 5 }, () => '<div class="admin-list-skeleton-row"><span class="skeleton-block thumb"></span><span class="lines"><span class="skeleton-block"></span><span class="skeleton-block"></span></span><span class="skeleton-block control"></span></div>').join("")}</div><p class="sr-only">Loading catalog products…</p>`;
  status.textContent = "";

  let query = window.supabaseClient
    .from("lego_sets")
    .select("set_num,name,year,image_url,is_featured,is_visible", { count: "exact" })
    .order("is_featured", { ascending: false })
    .order("display_order")
    .limit(50);

  if (search) query = query.or(`name.ilike.%${search}%,set_num.ilike.%${search}%`);
  const { data, error, count } = await query;

  if (error) {
    list.replaceChildren();
    status.textContent = `Could not load products: ${error.message}`;
    return;
  }

  list.replaceChildren();
  data.forEach((product) => {
    const row = document.createElement("article");
    row.className = "admin-product-row";
    row.dataset.setNumber = product.set_num;
    row.innerHTML = `
      <img alt="" loading="lazy" />
      <div class="admin-product-name">
        <strong></strong>
        <span></span>
      </div>
      <label class="toggle-control">
        <input type="checkbox" data-field="is_featured" />
        <span>Featured</span>
      </label>
      <label class="toggle-control">
        <input type="checkbox" data-field="is_visible" />
        <span>Visible</span>
      </label>`;
    row.querySelector("img").src = product.image_url || "";
    row.querySelector(".admin-product-name strong").textContent = product.name;
    row.querySelector(".admin-product-name span").textContent = `${product.set_num} · ${product.year}`;
    row.querySelector('[data-field="is_featured"]').checked = product.is_featured;
    row.querySelector('[data-field="is_visible"]').checked = product.is_visible;
    list.append(row);
  });

  status.textContent = count > data.length
    ? `Showing the first ${data.length} of ${count} matching products. Search to narrow the list.`
    : `${count} matching product${count === 1 ? "" : "s"}.`;
}

document.querySelector("#admin-product-list").addEventListener("change", async (event) => {
  const toggle = event.target.closest("input[data-field]");
  if (!toggle) return;

  const row = toggle.closest(".admin-product-row");
  const field = toggle.dataset.field;
  const nextValue = toggle.checked;
  toggle.disabled = true;

  const { error } = await window.supabaseClient
    .from("lego_sets")
    .update({ [field]: nextValue })
    .eq("set_num", row.dataset.setNumber);

  toggle.disabled = false;
  if (error) {
    toggle.checked = !nextValue;
    document.querySelector("#admin-list-status").textContent = `Could not update the product: ${error.message}`;
  }
});

let adminSearchTimer;
document.querySelector("#admin-product-search").addEventListener("input", () => {
  clearTimeout(adminSearchTimer);
  adminSearchTimer = setTimeout(loadAdminProducts, 300);
});

let ebaySyncOffset = 0;
document.querySelector("#sync-ebay-products").addEventListener("click", async () => {
  const button = document.querySelector("#sync-ebay-products");
  const status = document.querySelector("#ebay-sync-status");
  const search = safeSearchTerm(document.querySelector("#admin-product-search").value);
  const visibleSetNumbers = [...document.querySelectorAll(".admin-product-row")]
    .map((row) => row.dataset.setNumber)
    .filter(Boolean)
    .slice(0, 10);
  const body = search
    ? { setNumbers: visibleSetNumbers }
    : { limit: 10, offset: ebaySyncOffset };

  if (search && !visibleSetNumbers.length) {
    status.textContent = "No displayed catalog products are available to sync.";
    return;
  }

  button.disabled = true;
  button.textContent = "Syncing eBay…";
  status.textContent = "Requesting current fixed-price listings and verifying set-number matches…";

  try {
    const { data, error } = await window.supabaseClient.functions.invoke("sync-ebay", { body });
    if (error || data?.error) throw new Error(data?.error || error.message);
    const results = data.results || [];
    const successful = results.filter((result) => !result.error);
    const failed = results.length - successful.length;
    const listingCount = successful.reduce((total, result) => total + Number(result.matched_listings || 0), 0);
    if (!search && results.length) ebaySyncOffset += results.length;
    if (!search && results.length < 10) ebaySyncOffset = 0;
    status.textContent = `${data.environment === "production" ? "Live" : "Sandbox"} sync finished: ${listingCount} verified listings across ${successful.length} sets${failed ? `; ${failed} sets failed` : ""}.`;
  } catch (error) {
    status.textContent = `eBay sync could not run: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Sync next 10 from eBay";
  }
});

async function signOutToLogin() {
  await window.supabaseClient.auth.signOut();
  loginForm.reset();
  loginNotice.textContent = "";
  showView("login");
  emailInput.focus();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginNotice.textContent = "";

  if (!loginForm.reportValidity()) return;

  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";

  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });
    if (error) throw error;
    await checkAdminAccess(data.user);
  } catch (error) {
    loginNotice.textContent = error.message || "Unable to sign in. Please try again.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in as admin";
  }
});

document.querySelector("#switch-account").addEventListener("click", signOutToLogin);
document.querySelector("#admin-sign-out").addEventListener("click", signOutToLogin);

async function initialize() {
  try {
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    if (error) throw error;

    if (!session) {
      showView("login");
      return;
    }

    await checkAdminAccess(session.user);
  } catch (error) {
    showView("login");
    loginNotice.textContent = `Could not verify admin access: ${error.message}`;
  }
}

initialize();

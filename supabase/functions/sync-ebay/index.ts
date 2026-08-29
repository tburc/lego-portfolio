import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CatalogSet = {
  set_num: string;
  name: string;
};

type EbayItem = Record<string, unknown> & {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  condition?: string;
  itemEndDate?: string;
  price?: { value?: string; currency?: string };
  image?: { imageUrl?: string };
  thumbnailImages?: Array<{ imageUrl?: string }>;
  buyingOptions?: string[];
  shippingOptions?: Array<{ shippingCost?: { value?: string; currency?: string } }>;
  seller?: { username?: string; feedbackPercentage?: string };
  itemLocation?: { country?: string };
};

let cachedToken = "";
let cachedTokenExpiresAt = 0;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function ebayEnvironment() {
  const production = Deno.env.get("EBAY_ENVIRONMENT")?.toLowerCase() === "production";
  return {
    name: production ? "production" : "sandbox",
    apiBase: production ? "https://api.ebay.com" : "https://api.sandbox.ebay.com",
  };
}

async function getApplicationToken(apiBase: string) {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const clientId = requiredEnvironment("EBAY_CLIENT_ID");
  const clientSecret = requiredEnvironment("EBAY_CLIENT_SECRET");
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });
  const response = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "eBay authentication failed.");
  }

  cachedToken = payload.access_token;
  cachedTokenExpiresAt = Date.now() + Math.max(Number(payload.expires_in || 7200) - 90, 60) * 1000;
  return cachedToken;
}

function endUserContext() {
  const values: string[] = [];
  const campaignId = Deno.env.get("EBAY_AFFILIATE_CAMPAIGN_ID");
  const country = Deno.env.get("EBAY_BUYER_COUNTRY") || "US";
  const postalCode = Deno.env.get("EBAY_BUYER_POSTAL_CODE");
  if (campaignId) values.push(`affiliateCampaignId=${campaignId}`);
  if (postalCode) {
    const location = encodeURIComponent(`country=${country},zip=${postalCode}`);
    values.push(`contextualLocation=${location}`);
  }
  return values.join(",");
}

function containsExactSetNumber(title: string, setNumber: string) {
  const baseNumber = setNumber.split("-")[0].replace(/[^0-9]/g, "");
  if (!baseNumber) return false;
  const escaped = baseNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`, "i").test(title);
}

function looksLikeCompleteSet(title: string, setNumber: string) {
  if (!containsExactSetNumber(title, setNumber)) return false;
  const excluded = [
    /\b(instructions?|manuals?)\s+only\b/i,
    /\b(empty\s+)?box\s+only\b/i,
    /\b(parts?|pieces?)\s+only\b/i,
    /\b(minifigs?|minifigures?)\s+only\b/i,
    /\b(stickers?|decals?)\s+only\b/i,
    /\bincomplete\b/i,
    /\bpartial\s+(set|kit|lot)\b/i,
    /\bmissing\s+(pieces?|parts?|minifigs?|minifigures?)\b/i,
    /\b(no|without)\s+(minifigs?|minifigures?)\b/i,
    /\b(light|lighting|led)\s+kit\b/i,
    /\bdisplay\s+(case|stand)\b/i,
    /\bdust\s+cover\b/i,
    /\bwall\s+mount\b/i,
    /\bcompatible\s+with\b/i,
    /\breplacement\b/i,
    /\bcustom\s+(set|kit|model)\b/i,
    /\bmoc\b/i,
  ];
  return !excluded.some((pattern) => pattern.test(title));
}

function normalizeCondition(value: unknown) {
  const condition = String(value || "").toLowerCase();
  if (condition.includes("new")) return "new";
  if (condition.includes("used") || condition.includes("pre-owned")) return "used";
  return "other";
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeListing(item: EbayItem, set: CatalogSet, syncedAt: string) {
  const itemPrice = numberOrNull(item.price?.value);
  const currency = String(item.price?.currency || "").toUpperCase();
  const shippingPrices = (item.shippingOptions || [])
    .map((option) => option.shippingCost)
    .filter((cost) => cost && String(cost.currency || "").toUpperCase() === currency)
    .map((cost) => numberOrNull(cost?.value))
    .filter((value): value is number => value !== null);
  const shippingPrice = shippingPrices.length ? Math.min(...shippingPrices) : null;
  const listingUrl = String(item.itemAffiliateWebUrl || item.itemWebUrl || "");

  if (!item.itemId || !item.title || itemPrice === null || currency.length !== 3 || !listingUrl) {
    return null;
  }

  return {
    marketplace: "ebay",
    external_listing_id: item.itemId,
    set_num: set.set_num,
    title: item.title,
    item_condition: normalizeCondition(item.condition),
    item_price: itemPrice,
    shipping_price: shippingPrice,
    total_price: shippingPrice === null ? null : Number((itemPrice + shippingPrice).toFixed(2)),
    currency_code: currency,
    listing_url: listingUrl,
    image_url: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
    seller_username: item.seller?.username || null,
    seller_feedback_percentage: numberOrNull(item.seller?.feedbackPercentage),
    buying_options: Array.isArray(item.buyingOptions) ? item.buyingOptions : [],
    item_location_country: item.itemLocation?.country || null,
    is_active: true,
    last_seen_at: syncedAt,
    item_end_at: item.itemEndDate || null,
  };
}

async function searchEbay(set: CatalogSet, token: string, apiBase: string) {
  const baseSetNumber = set.set_num.split("-")[0];
  const url = new URL(`${apiBase}/buy/browse/v1/item_summary/search`);
  url.searchParams.set("q", `LEGO ${baseSetNumber}`);
  url.searchParams.set("limit", "20");
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE},conditions:{NEW|USED}");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": Deno.env.get("EBAY_MARKETPLACE_ID") || "EBAY_US",
  };
  const context = endUserContext();
  if (context) headers["X-EBAY-C-ENDUSERCTX"] = context;

  const response = await fetch(url, { headers });
  const payload = await response.json();
  if (!response.ok) {
    const message = payload.errors?.[0]?.message || payload.error_description || "eBay search failed.";
    throw new Error(`${set.set_num}: ${message}`);
  }

  return (payload.itemSummaries || []) as EbayItem[];
}

function buildSnapshots(rows: Array<Record<string, unknown>>, syncedAt: string) {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  rows.forEach((row) => {
    const key = `${row.item_condition}:${row.currency_code}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });

  return [...groups.values()].map((group) => {
    const prices = group.map((row) => Number(row.item_price));
    const totals = group.map((row) => row.total_price).filter((value) => value !== null).map(Number);
    return {
      marketplace: "ebay",
      set_num: group[0].set_num,
      item_condition: group[0].item_condition,
      currency_code: group[0].currency_code,
      lowest_item_price: Math.min(...prices),
      lowest_total_price: totals.length ? Math.min(...totals) : null,
      average_item_price: Number((prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2)),
      listing_count: group.length,
      recorded_at: syncedAt,
    };
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in as an admin first." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");
    if (adminError || !isAdmin) return json({ error: "Admin access required." }, 403);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const body = await request.json().catch(() => ({}));
    const requestedNumbers = Array.isArray(body.setNumbers)
      ? [...new Set(body.setNumbers.map((value: unknown) => String(value).trim()).filter(Boolean))].slice(0, 10)
      : [];
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 10);
    const offset = Math.max(Number(body.offset) || 0, 0);

    let setsQuery = serviceClient.from("lego_sets").select("set_num,name");
    if (requestedNumbers.length) {
      setsQuery = setsQuery.in("set_num", requestedNumbers);
    } else {
      setsQuery = setsQuery
        .eq("is_visible", true)
        .order("display_order")
        .range(offset, offset + limit - 1);
    }
    const { data: sets, error: setsError } = await setsQuery;
    if (setsError) throw setsError;
    if (!sets?.length) return json({ results: [], message: "No catalog sets matched this batch." });

    const environment = ebayEnvironment();
    const token = await getApplicationToken(environment.apiBase);
    const results = [];

    for (const set of sets as CatalogSet[]) {
      try {
        const items = await searchEbay(set, token, environment.apiBase);
        const syncedAt = new Date().toISOString();
        const rows = items
          .filter((item) => looksLikeCompleteSet(String(item.title || ""), set.set_num))
          .map((item) => normalizeListing(item, set, syncedAt))
          .filter(Boolean) as Array<Record<string, unknown>>;

        const { error: deactivateError } = await serviceClient
          .from("marketplace_listings")
          .update({ is_active: false })
          .eq("marketplace", "ebay")
          .eq("set_num", set.set_num);
        if (deactivateError) throw deactivateError;

        if (rows.length) {
          const { error: upsertError } = await serviceClient
            .from("marketplace_listings")
            .upsert(rows, { onConflict: "marketplace,external_listing_id" });
          if (upsertError) throw upsertError;

          const snapshots = buildSnapshots(rows, syncedAt);
          const { error: snapshotError } = await serviceClient
            .from("marketplace_price_snapshots")
            .insert(snapshots);
          if (snapshotError) throw snapshotError;
        }

        const totals = rows.map((row) => row.total_price ?? row.item_price).map(Number);
        results.push({
          set_num: set.set_num,
          matched_listings: rows.length,
          from_price: totals.length ? Math.min(...totals) : null,
          currency_code: rows[0]?.currency_code || null,
          synced_at: syncedAt,
        });
      } catch (error) {
        results.push({
          set_num: set.set_num,
          error: error instanceof Error ? error.message : "eBay sync failed.",
        });
      }
    }

    return json({ environment: environment.name, results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "eBay sync failed." }, 400);
  }
});

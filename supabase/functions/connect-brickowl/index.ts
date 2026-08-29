import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, unknown>;

type CatalogSet = {
  set_num: string;
  name: string;
  image_url: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}

function safeErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return message.replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]");
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(source: unknown, keys: string[]): string | null {
  if (!isRecord(source)) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isRecord(value)) {
      const nested = firstString(value, ["name", "code", "value", "url"]);
      if (nested) return nested;
    }
  }

  return null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerValue(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (["0", "false", "no"].includes(value.toLowerCase())) return false;
    if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  }
  return fallback;
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importEncryptionKey() {
  let raw: Uint8Array;
  try {
    raw = decodeBase64(requiredEnvironment("LINKED_ACCOUNT_ENCRYPTION_KEY"));
  } catch {
    throw new Error("LINKED_ACCOUNT_ENCRYPTION_KEY must be valid base64.");
  }

  if (raw.byteLength !== 32) {
    throw new Error("LINKED_ACCOUNT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptApiKey(apiKey: string, userId: string) {
  const key = await importEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(apiKey);
  const additionalData = new TextEncoder().encode(`${userId}:brickowl:v1`);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, encoded);
  return {
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    iv: encodeBase64(iv),
  };
}

async function decryptApiKey(ciphertext: string, iv: string, userId: string) {
  const key = await importEncryptionKey();
  const additionalData = new TextEncoder().encode(`${userId}:brickowl:v1`);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(iv), additionalData },
    key,
    decodeBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

async function brickOwlGet(endpoint: string, apiKey: string, parameters: Record<string, string> = {}) {
  const url = new URL(`https://api.brickowl.com/v1/${endpoint}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.text();
  let payload: unknown = null;

  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = body;
  }

  if (!response.ok) {
    throw new Error(`Brick Owl rejected the request (${response.status}). Check the API key's read-only permissions.`);
  }

  if (isRecord(payload) && (payload.error || payload.errors)) {
    throw new Error("Brick Owl returned an API error. Check the API key and its read-only permissions.");
  }

  return payload;
}

function inventoryArray(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  for (const key of ["inventory", "items", "lots", "data"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value)) {
      const nested = inventoryArray(value);
      if (nested.length) return nested;
    }
  }

  return [];
}

function normalizeCondition(value: unknown) {
  const condition = String(value ?? "").trim().toLowerCase();
  if (["n", "new"].includes(condition)) return "new";
  if (["u", "used"].includes(condition)) return "used";
  return "other";
}

function normalizeItemType(value: unknown) {
  const type = String(value ?? "").trim().toLowerCase();
  if (type === "s" || type.includes("set")) return "set";
  if (type.includes("mini")) return "minifigure";
  if (type === "p" || type.includes("part")) return "part";
  if (type.includes("gear")) return "gear";
  return "other";
}

function collectReferenceValues(value: unknown, results: string[] = []): string[] {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    if (text) results.push(text);
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectReferenceValues(item, results);
    return results;
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (["id", "value", "item_no", "set_num", "number", "name"].includes(key.toLowerCase())) {
        collectReferenceValues(nested, results);
      }
    }
  }

  return results;
}

function matchCatalogSet(item: JsonRecord, catalogByNumber: Map<string, CatalogSet>, catalogByBase: Map<string, CatalogSet | null>) {
  const candidates = collectReferenceValues([
    item.set_num,
    item.set_number,
    item.item_no,
    item.design_id,
    item.ids,
    item.references,
  ]);

  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (catalogByNumber.has(normalized)) return catalogByNumber.get(normalized) ?? null;
    const base = normalized.replace(/-\d+$/, "");
    const baseMatch = catalogByBase.get(base);
    if (baseMatch) return baseMatch;
  }

  return null;
}

function profileFromDetails(details: unknown) {
  const username = firstString(details, ["username", "user_name", "name", "store_username"]);
  const storeName = firstString(details, ["store_name", "shop_name", "business_name"]);
  const storeUrl = safeUrl(firstString(details, ["store_url", "shop_url", "url"]));
  const rawCurrency = firstString(details, ["currency_code", "currency"]);
  const currency = rawCurrency?.toUpperCase().match(/^[A-Z]{3}$/)?.[0] ?? null;
  return { username, storeName, storeUrl, currency };
}

async function syncInventory(
  serviceClient: ReturnType<typeof createClient>,
  account: JsonRecord,
  apiKey: string,
  detailsPayload?: unknown,
  inventoryPayload?: unknown,
) {
  const accountId = String(account.id);
  const userId = String(account.user_id);
  const now = new Date().toISOString();

  try {
    const [details, inventoryResponse] = await Promise.all([
      detailsPayload ?? brickOwlGet("user/details", apiKey),
      inventoryPayload ?? brickOwlGet("inventory/list", apiKey, { active_only: "1" }),
    ]);
    const inventory = inventoryArray(inventoryResponse).filter((item) =>
      booleanValue(item.for_sale, true) && integerValue(item.qty ?? item.quantity, 0) > 0
    );
    const profile = profileFromDetails(details);
    const currency = profile.currency ?? firstString(account, ["currency_code"]) ?? "USD";

    const { data: catalogRows, error: catalogError } = await serviceClient
      .from("lego_sets")
      .select("set_num,name,image_url")
      .limit(10000);
    if (catalogError) throw catalogError;

    const catalogByNumber = new Map<string, CatalogSet>();
    const catalogByBase = new Map<string, CatalogSet | null>();
    for (const row of (catalogRows ?? []) as CatalogSet[]) {
      catalogByNumber.set(row.set_num, row);
      const base = row.set_num.replace(/-\d+$/, "");
      catalogByBase.set(base, catalogByBase.has(base) ? null : row);
    }

    const sellerRows = inventory.map((item, index) => {
      const catalogSet = matchCatalogSet(item, catalogByNumber, catalogByBase);
      const externalItemId = String(item.boid ?? item.owl_id ?? "").trim() || null;
      const externalListingId = String(item.lot_id ?? item.id ?? `${externalItemId ?? "item"}-${index}`).trim();
      const itemType = normalizeItemType(item.type ?? item.item_type);
      const itemCondition = normalizeCondition(item.full_con ?? item.con ?? item.condition);
      const price = numberValue(item.final_price ?? item.price ?? item.base_price);
      const listingUrl = safeUrl(item.url ?? item.listing_url);
      const title = catalogSet?.name
        ?? firstString(item, ["title", "name", "item_name"])
        ?? `Brick Owl item ${externalItemId ?? externalListingId}`;

      return {
        account_id: accountId,
        user_id: userId,
        marketplace: "brickowl",
        external_listing_id: externalListingId,
        external_item_id: externalItemId,
        set_num: catalogSet?.set_num ?? null,
        title,
        item_type: catalogSet ? "set" : itemType,
        item_condition: itemCondition,
        quantity: integerValue(item.qty ?? item.quantity, 1),
        unit_price: price,
        currency_code: currency,
        listing_url: listingUrl,
        image_url: catalogSet?.image_url ?? safeUrl(item.image_url ?? item.image),
        is_active: true,
        public_reference: {
          boid: externalItemId,
          type: item.type ?? null,
          ids: item.ids ?? null,
        },
        last_seen_at: now,
      };
    });

    const { error: deactivateError } = await serviceClient
      .from("seller_listings")
      .update({ is_active: false })
      .eq("account_id", accountId);
    if (deactivateError) throw deactivateError;

    if (sellerRows.length) {
      const { error: sellerError } = await serviceClient
        .from("seller_listings")
        .upsert(sellerRows, { onConflict: "account_id,external_listing_id" });
      if (sellerError) throw sellerError;
    }

    const { error: deactivatePublicError } = await serviceClient
      .from("marketplace_listings")
      .update({ is_active: false, last_seen_at: now })
      .eq("linked_account_id", accountId);
    if (deactivatePublicError) throw deactivatePublicError;

    const matchedRows = sellerRows.filter((row) => row.set_num);
    const publicRows = account.share_listings_publicly
      ? matchedRows.filter((row) => row.unit_price !== null && row.currency_code && row.listing_url)
      : [];

    if (publicRows.length) {
      const marketplaceRows = publicRows.map((row) => ({
        marketplace: "brickowl",
        external_listing_id: `${accountId}:${row.external_listing_id}`,
        linked_account_id: accountId,
        set_num: row.set_num,
        title: row.title,
        item_condition: row.item_condition,
        item_price: row.unit_price,
        shipping_price: null,
        total_price: row.unit_price,
        currency_code: row.currency_code,
        listing_url: row.listing_url,
        image_url: row.image_url,
        seller_username: profile.username ?? account.external_username,
        buying_options: ["FIXED_PRICE"],
        is_active: true,
        last_seen_at: now,
      }));
      const { error: publicError } = await serviceClient
        .from("marketplace_listings")
        .upsert(marketplaceRows, { onConflict: "marketplace,external_listing_id" });
      if (publicError) throw publicError;

      const priceGroups = new Map<string, typeof publicRows>();
      for (const row of publicRows) {
        const key = `${row.set_num}:${row.item_condition}:${row.currency_code}`;
        const group = priceGroups.get(key) ?? [];
        group.push(row);
        priceGroups.set(key, group);
      }
      const snapshots = [...priceGroups.values()].map((rows) => {
        const prices = rows.map((row) => Number(row.unit_price));
        return {
          marketplace: "brickowl",
          set_num: rows[0].set_num,
          item_condition: rows[0].item_condition,
          currency_code: rows[0].currency_code,
          lowest_item_price: Math.min(...prices),
          lowest_total_price: null,
          average_item_price: prices.reduce((sum, price) => sum + price, 0) / prices.length,
          listing_count: rows.length,
          recorded_at: now,
        };
      });
      const { error: snapshotError } = await serviceClient
        .from("marketplace_price_snapshots")
        .insert(snapshots);
      if (snapshotError) throw snapshotError;
    }

    const matchedSetNumbers = new Set(matchedRows.map((row) => row.set_num));
    const { error: updateError } = await serviceClient
      .from("linked_marketplace_accounts")
      .update({
        external_username: profile.username ?? account.external_username,
        external_store_name: profile.storeName ?? account.external_store_name,
        external_store_url: profile.storeUrl ?? account.external_store_url,
        status: "connected",
        inventory_count: sellerRows.length,
        matched_set_count: matchedSetNumbers.size,
        last_synced_at: now,
        last_error: null,
      })
      .eq("id", accountId);
    if (updateError) throw updateError;

    return {
      inventoryCount: sellerRows.length,
      matchedSetCount: matchedSetNumbers.size,
      publicListingCount: publicRows.length,
    };
  } catch (error) {
    const message = safeErrorMessage(error, "Brick Owl sync failed.");
    await serviceClient
      .from("linked_marketplace_accounts")
      .update({ status: "error", last_error: message })
      .eq("id", accountId);
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!authorization) return jsonResponse({ error: "You must be signed in." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: "Your session is invalid or expired." }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await request.json().catch(() => ({})) as JsonRecord;
    const action = typeof body.action === "string" ? body.action : "status";
    const userId = authData.user.id;

    if (action === "status") {
      const { data, error } = await serviceClient
        .from("linked_marketplace_accounts")
        .select("id,marketplace,external_username,external_store_name,external_store_url,currency_code,status,share_listings_publicly,inventory_count,matched_set_count,last_synced_at,last_error")
        .eq("user_id", userId)
        .eq("marketplace", "brickowl")
        .maybeSingle();
      if (error) throw error;
      return jsonResponse({ account: data ?? null });
    }

    if (action === "disconnect") {
      const { error } = await serviceClient
        .from("linked_marketplace_accounts")
        .delete()
        .eq("user_id", userId)
        .eq("marketplace", "brickowl");
      if (error) throw error;
      return jsonResponse({ disconnected: true });
    }

    if (action === "connect") {
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (apiKey.length < 8 || apiKey.length > 500) {
        return jsonResponse({ error: "Enter a valid Brick Owl API key." }, 400);
      }

      const [details, inventory] = await Promise.all([
        brickOwlGet("user/details", apiKey),
        brickOwlGet("inventory/list", apiKey, { active_only: "1" }),
      ]);
      const profile = profileFromDetails(details);
      const requestedCurrency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "USD";
      const currency = profile.currency ?? requestedCurrency;
      if (!/^[A-Z]{3}$/.test(currency)) return jsonResponse({ error: "Enter a three-letter store currency code." }, 400);
      const { data: account, error: accountError } = await serviceClient
        .from("linked_marketplace_accounts")
        .upsert({
          user_id: userId,
          marketplace: "brickowl",
          external_username: profile.username,
          external_store_name: profile.storeName,
          external_store_url: profile.storeUrl,
          currency_code: currency,
          status: "connected",
          share_listings_publicly: body.sharePublic !== false,
          last_error: null,
        }, { onConflict: "user_id,marketplace" })
        .select("*")
        .single();
      if (accountError || !account) throw accountError ?? new Error("Could not save the linked account.");

      const encrypted = await encryptApiKey(apiKey, userId);
      const { error: credentialError } = await serviceClient
        .from("linked_marketplace_credentials")
        .upsert({
          account_id: account.id,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          encryption_version: 1,
          updated_at: new Date().toISOString(),
        });
      if (credentialError) throw credentialError;

      const result = await syncInventory(serviceClient, account, apiKey, details, inventory);
      return jsonResponse({ connected: true, account: { ...account, ...result } });
    }

    if (action === "sync") {
      const { data: account, error: accountError } = await serviceClient
        .from("linked_marketplace_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("marketplace", "brickowl")
        .single();
      if (accountError || !account) return jsonResponse({ error: "Connect a Brick Owl account first." }, 404);

      const { data: credential, error: credentialError } = await serviceClient
        .from("linked_marketplace_credentials")
        .select("ciphertext,iv")
        .eq("account_id", account.id)
        .single();
      if (credentialError || !credential) throw credentialError ?? new Error("The saved credential is missing.");

      const apiKey = await decryptApiKey(credential.ciphertext, credential.iv, userId);
      const result = await syncInventory(serviceClient, account, apiKey);
      return jsonResponse({ synced: true, ...result });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    const message = safeErrorMessage(error, "Unexpected server error.");
    return jsonResponse({ error: message }, 500);
  }
});

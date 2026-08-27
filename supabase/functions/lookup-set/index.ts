const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { query, setNumber, includeMinifigures = true, limit = 20 } = await request.json();
    const search = String(query || setNumber || "").trim();
    if (!search) throw new Error("Enter a set or minifigure name or number.");

    const apiKey = Deno.env.get("REBRICKABLE_API_KEY");
    if (!apiKey) throw new Error("REBRICKABLE_API_KEY is not configured.");
    const headers = { Authorization: `key ${apiKey}` };
    const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const words = search.toLowerCase().split(/[^a-z0-9]+/).filter((word: string) => word.length > 1);
    const wordPairs = words.slice(0, -1).map((word: string, index: number) => `${word} ${words[index + 1]}`);
    const searches = [...new Set([
      search,
      search.replace(/[\s_-]+/g, "-"),
      search.replace(/[-_]+/g, " "),
      ...wordPairs,
      ...words.filter((word: string) => word.length >= 3),
    ])].slice(0, 8);
    const endpoint = (kind: "sets" | "minifigs", term: string) => {
      const params = new URLSearchParams({ search: term, page_size: String(pageSize) });
      return `https://rebrickable.com/api/v3/lego/${kind}/?${params}`;
    };

    const kinds: ("sets" | "minifigs")[] = includeMinifigures ? ["sets", "minifigs"] : ["sets"];
    const requestTypes = kinds.flatMap((kind) => searches.map((term) => ({ kind, term })));
    const requests = requestTypes.map(({ kind, term }) => fetch(endpoint(kind, term), { headers }));
    const responses = await Promise.all(requests);
    if (responses.some((response) => !response.ok)) throw new Error("LEGO search provider returned an error.");
    const payloads = await Promise.all(responses.map((response) => response.json()));
    const uniqueItems = new Map<string, Record<string, unknown>>();
    payloads.forEach((payload, index) => {
      const type = requestTypes[index].kind === "minifigs" ? "minifigure" : "set";
      for (const item of payload?.results || []) {
        const key = `${type}:${item.set_num || item.fig_num || item.id || item.name}`;
        if (!uniqueItems.has(key)) uniqueItems.set(key, { ...item, type });
      }
    });

    const compact = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = compact(search);
    const distance = (left: string, right: string) => {
      const row = Array.from({ length: right.length + 1 }, (_, index) => index);
      for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        let diagonal = row[0];
        row[0] = leftIndex;
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
          const previous = row[rightIndex];
          row[rightIndex] = Math.min(
            row[rightIndex] + 1,
            row[rightIndex - 1] + 1,
            diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
          );
          diagonal = previous;
        }
      }
      return row[right.length];
    };
    const queryWords = search.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const results = [...uniqueItems.values()].sort((left, right) => {
      const score = (item: Record<string, unknown>) => {
        const name = compact(item.name || item.descr);
        if (name === target) return 0;
        if (name.startsWith(target)) return 1;
        if (name.includes(target)) return 2;
        const nameWords = String(item.name || item.descr || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const typoPenalty = queryWords.reduce((total, queryWord) => {
          const closest = Math.min(...nameWords.map((nameWord) => distance(queryWord, nameWord)));
          return total + closest / Math.max(queryWord.length, 1);
        }, 0);
        return 3 + typoPenalty;
      };
      return score(left) - score(right);
    }).slice(0, pageSize);

    // Enrich all visible sets with original U.S. retail prices in one Brickset call.
    const bricksetApiKey = Deno.env.get("BRICKSET_API_KEY");
    const setNumbers = results
      .filter((item) => item.type === "set" && item.set_num)
      .map((item) => String(item.set_num));
    if (bricksetApiKey && setNumbers.length) {
      try {
        const body = new URLSearchParams({
          apiKey: bricksetApiKey,
          userHash: "",
          params: JSON.stringify({ setNumber: setNumbers.join(","), pageSize: setNumbers.length }),
        });
        const bricksetResponse = await fetch("https://brickset.com/api/v3.asmx/getSets", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (bricksetResponse.ok) {
          const bricksetPayload = await bricksetResponse.json();
          if (bricksetPayload?.status === "success") {
            const bricksetSets = new Map<string, Record<string, unknown>>();
            for (const set of bricksetPayload.sets || []) {
              const number = String(set.number || "");
              const variant = String(set.numberVariant || "1");
              bricksetSets.set(`${number}-${variant}`, set);
              if (!bricksetSets.has(number)) bricksetSets.set(number, set);
            }
            for (const item of results) {
              if (item.type !== "set") continue;
              const itemNumber = String(item.set_num || "");
              const bricksetSet = bricksetSets.get(itemNumber) || bricksetSets.get(itemNumber.split("-")[0]);
              if (!bricksetSet) continue;
              const legoCom = bricksetSet.LEGOCom as Record<string, unknown> | undefined;
              const us = (bricksetSet.US || legoCom?.US) as Record<string, unknown> | undefined;
              const retailPrice = Number(
                us?.retailPrice ??
                (bricksetSet.retailPrice as Record<string, unknown> | undefined)?.US ??
                bricksetSet.USRetailPrice,
              );
              if (Number.isFinite(retailPrice) && retailPrice > 0) {
                item.retail_price = retailPrice;
                item.retail_currency = "USD";
                item.retail_price_source = "Brickset";
              }
              if (bricksetSet.bricksetURL) item.brickset_url = bricksetSet.bricksetURL;
              if (bricksetSet.setID) item.brickset_set_id = bricksetSet.setID;
            }
          }
        }
      } catch {
        // Search still works when Brickset is temporarily unavailable.
      }
    }

    return Response.json({ results }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 400, headers: corsHeaders },
    );
  }
});

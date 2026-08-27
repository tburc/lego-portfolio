const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { setNumbers = [] } = await request.json();
    const numbers = [...new Set(
      (Array.isArray(setNumbers) ? setNumbers : [])
        .map((value) => String(value).trim())
        .filter((value) => /^\d+-\d+$/.test(value)),
    )].slice(0, 50);
    if (!numbers.length) throw new Error("Provide at least one valid set number.");

    const apiKey = Deno.env.get("BRICKSET_API_KEY");
    if (!apiKey) throw new Error("BRICKSET_API_KEY is not configured.");
    const body = new URLSearchParams({
      apiKey,
      userHash: "",
      params: JSON.stringify({ setNumber: numbers.join(","), pageSize: numbers.length }),
    });
    const response = await fetch("https://brickset.com/api/v3.asmx/getSets", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error("Brickset price lookup failed.");
    const payload = await response.json();
    if (payload?.status !== "success") throw new Error(payload?.message || "Brickset price lookup failed.");

    const results = (payload.sets || []).map((set) => {
      const legoCom = set.LEGOCom || {};
      const us = set.US || legoCom.US || {};
      const retailPrice = Number(us.retailPrice ?? set.retailPrice?.US ?? set.USRetailPrice);
      return {
        set_num: `${set.number}-${set.numberVariant || 1}`,
        brickset_set_id: set.setID || null,
        retail_price: Number.isFinite(retailPrice) && retailPrice > 0 ? retailPrice : null,
        retail_currency: "USD",
      };
    });
    return Response.json({ results }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Price lookup failed." },
      { status: 400, headers: corsHeaders },
    );
  }
});

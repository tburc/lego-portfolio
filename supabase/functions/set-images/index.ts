const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { setId } = await request.json();
    const numericSetId = Number(setId);
    if (!Number.isInteger(numericSetId) || numericSetId <= 0) {
      return Response.json({ images: [] }, { headers: corsHeaders });
    }
    const apiKey = Deno.env.get("BRICKSET_API_KEY");
    if (!apiKey) throw new Error("BRICKSET_API_KEY is not configured.");
    const body = new URLSearchParams({ apiKey, setID: String(numericSetId) });
    const response = await fetch("https://brickset.com/api/v3.asmx/getAdditionalImages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) throw new Error("Additional images are unavailable.");
    const payload = await response.json();
    if (payload?.status !== "success") throw new Error(payload?.message || "Additional images are unavailable.");
    const images = [...new Set(
      (payload.additionalImages || [])
        .map((item) => item.imageURL || item.thumbnailURL || item.image)
        .filter((url) => typeof url === "string" && /^https:\/\//i.test(url)),
    )].slice(0, 20);
    return Response.json({ images }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Image lookup failed." },
      { status: 400, headers: corsHeaders },
    );
  }
});

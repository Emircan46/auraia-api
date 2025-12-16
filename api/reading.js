module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { locale="tr", category, name="", tarotCards=[], userText="", imageDataUrl=null } = body;

    if (!category) return res.status(400).json({ error: "Missing category" });

    const instructions =
      locale === "tr"
        ? `Sen Auraia Oracle'sun. Ton: premium, samimi, merak uyandıran; kesin hüküm verme.
Fal/yorum eğlence amaçlıdır. Sağlık/hukuk/finans alanında kesin tavsiye verme.
ÇIKTI SADECE JSON olacak.`
        : `You are Auraia Oracle. Tone: premium, warm, curiosity-driven; never absolute.
Readings are for entertainment only. No medical/legal/financial certainty.
OUTPUT MUST BE ONLY JSON.`;

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        shortSummary: { type: "string" },
        now: { type: "string" },
        premiumHook: { type: "string" },
        nearFuture: { type: "string" },
        advice: { type: "string" }
      },
      required: ["shortSummary", "now", "premiumHook", "nearFuture", "advice"]
    };

    const contextText =
      locale === "tr"
        ? `Kullanıcı: ${name || "—"}
Kategori: ${category}
Tarot: ${tarotCards?.length ? tarotCards.join(" • ") : "—"}
Not/Soru: ${userText || "—"}

Çıktı: shortSummary, now, premiumHook(tek cümle merak), nearFuture, advice.`
        : `User: ${name || "—"}
Category: ${category}
Tarot: ${tarotCards?.length ? tarotCards.join(" • ") : "—"}
Note/Question: ${userText || "—"}

Output: shortSummary, now, premiumHook(one curiosity line), nearFuture, advice.`;

    const content = [{ type: "input_text", text: contextText }];
    if (imageDataUrl) content.push({ type: "input_image", image_url: imageDataUrl });

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        instructions,
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "auraia_reading", strict: true, schema } },
        max_output_tokens: 700,
        store: false
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });

    const parsed = JSON.parse(data.output_text);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};

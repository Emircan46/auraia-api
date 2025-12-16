module.exports = async (req, res) => {
  // --- CORS (çok kritik) ---
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Preflight isteği (OPTIONS) mutlaka 200 dönmeli
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const {
      locale = "tr",
      category,
      name = "",
      tarotCards = [],
      userText = "",
      imageDataUrl = null,
    } = body;

    if (!category) return res.status(400).json({ error: "Missing category" });

    // OpenAI Key kontrolü
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY eksik. Vercel > Settings > Environment Variables içine OPENAI_API_KEY ekle ve redeploy yap.",
      });
    }

    // Basit güvenlik: fal/eğlence dili
    const systemTR =
      "Sen Auraia Oracle'sun. Ton: premium, samimi, merak uyandıran. Kesin hüküm verme. Sağlık/hukuk/finans için kesin tavsiye verme. ÇIKTI SADECE JSON olacak.";
    const systemEN =
      "You are Auraia Oracle. Tone: premium, warm, curiosity-driven; never absolute. No medical/legal/financial certainty. OUTPUT MUST BE ONLY JSON.";
    const system = locale === "tr" ? systemTR : systemEN;

    // İstediğimiz JSON şeması (modeli yönlendirmek için)
    const schemaHint = {
      shortSummary: "string",
      now: "string",
      premiumHook: "string",
      nearFuture: "string",
      advice: "string",
    };

    // Kategoriye göre bağlam
    const contextLines = [
      `UserName: ${name || "-"}`,
      `Category: ${category}`,
    ];

    if (category === "tarot") contextLines.push(`TarotCards: ${tarotCards.join(", ")}`);
    if (userText) contextLines.push(`UserText: ${userText}`);
    if (category === "coffee") contextLines.push(`CoffeeImageProvided: ${Boolean(imageDataUrl)}`);

    const userPrompt =
      (locale === "tr"
        ? `Aşağıdaki bağlama göre bir fal/yorum üret.\nSadece JSON döndür. Şu anahtarlar zorunlu: ${Object.keys(schemaHint).join(", ")}.\n`
        : `Create an entertainment-only reading based on the context.\nReturn ONLY JSON. Required keys: ${Object.keys(schemaHint).join(", ")}.\n`) +
      `Context:\n${contextLines.join("\n")}\n\n` +
      `JSON_SHAPE_EXAMPLE:\n${JSON.stringify(schemaHint, null, 2)}`;

    // OpenAI çağrısı (SDK yok, fetch ile)
    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const oaiJson = await oaiRes.json();

    if (!oaiRes.ok) {
      // OpenAI hata detayını temiz biçimde döndür
      const detail =
        oaiJson?.error?.message ||
        oaiJson?.error?.type ||
        JSON.stringify(oaiJson);
      return res.status(502).json({ error: `OpenAI error: ${detail}` });
    }

    const text = oaiJson?.choices?.[0]?.message?.content || "";

    // Model bazen JSON dışında bir şey yazarsa yakalayalım
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({
        error: "Model JSON döndürmedi. İçerik parse edilemedi.",
        raw: text,
      });
    }

    // Eksik alanları tamamla (garanti)
    const required = ["shortSummary", "now", "premiumHook", "nearFuture", "advice"];
    for (const k of required) {
      if (typeof parsed?.[k] !== "string") parsed[k] = "";
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      detail: err?.message || String(err),
    });
  }
};

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const origin = request.headers.get("Origin");

    if (!allowedOrigin || origin !== allowedOrigin) {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(allowedOrigin),
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, allowedOrigin);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ error: "Сервер пока не настроен." }, 503, allowedOrigin);
    }

    // Fail closed: do not serve a public paid API without the rate-limit binding.
    if (!env.RATE_LIMITER || typeof env.RATE_LIMITER.limit !== "function") {
      return json({ error: "Защита от частых запросов ещё не настроена." }, 503, allowedOrigin);
    }

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const rate = await env.RATE_LIMITER.limit({ key: clientIp });
    if (!rate.success) {
      return json({ error: "Слишком много запросов. Подожди минуту и попробуй снова." }, 429, allowedOrigin);
    }

    let body;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 24000) {
        return json({ error: "Сообщение слишком большое." }, 413, allowedOrigin);
      }
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Некорректный формат запроса." }, 400, allowedOrigin);
    }

    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) {
      return json({ error: "Некорректная история чата." }, 400, allowedOrigin);
    }

    const messages = [];
    for (const item of body.messages) {
      if (!item || !["user", "assistant"].includes(item.role) ||
          typeof item.content !== "string" || item.content.length < 1 ||
          item.content.length > 6000) {
        return json({ error: "В сообщении обнаружен недопустимый формат." }, 400, allowedOrigin);
      }
      messages.push({ role: item.role, content: item.content });
    }

    if (messages[messages.length - 1].role !== "user") {
      return json({ error: "Последнее сообщение должно быть сообщением пользователя." }, 400, allowedOrigin);
    }

    try {
      const upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-5.5",
          instructions: "Ты — Skebob AI, полезный, дружелюбный и безопасный AI-ассистент. Отвечай на языке пользователя. Если не уверен — честно скажи об этом.",
          input: messages,
          max_output_tokens: 1000,
          store: false
        })
      });

      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        console.error("OpenAI API request failed:", upstream.status, result?.error?.code || "unknown_error");
        return json({ error: "AI-сервис временно недоступен. Попробуй позже." }, 502, allowedOrigin);
      }

      const reply = Array.isArray(result.output)
        ? result.output
            .flatMap(item => Array.isArray(item.content) ? item.content : [])
            .filter(part => part.type === "output_text" && typeof part.text === "string")
            .map(part => part.text)
            .join("\n")
            .trim()
        : "";
      if (!reply) {
        return json({ error: "AI не вернул текстовый ответ. Попробуй ещё раз." }, 502, allowedOrigin);
      }

      return json({ reply }, 200, allowedOrigin);
    } catch (error) {
      console.error("Chat request failed:", error?.name || "unknown_error");
      return json({ error: "Не удалось связаться с AI-сервисом." }, 502, allowedOrigin);
    }
  }
};

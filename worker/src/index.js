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

    if (!env.AI || typeof env.AI.run !== "function") {
      return json({ error: "Бесплатная AI-модель ещё не подключена в Cloudflare." }, 503, allowedOrigin);
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

    const messages = [{
      role: "system",
      content: "Ты — Skebob AI, полезный, дружелюбный и безопасный AI-ассистент. Отвечай на языке пользователя. Если не уверен — честно скажи об этом."
    }];

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
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8-fast", {
        messages,
        max_tokens: 900,
        temperature: 0.6
      });

      const reply = typeof result?.response === "string" ? result.response.trim() : "";
      if (!reply) {
        console.error("Workers AI returned an empty response");
        return json({ error: "AI не вернул текстовый ответ. Попробуй ещё раз." }, 502, allowedOrigin);
      }

      return json({ reply }, 200, allowedOrigin);
    } catch (error) {
      console.error("Workers AI request failed:", error?.name || "unknown_error");
      return json({ error: "Бесплатный лимит AI мог закончиться или модель временно недоступна. Попробуй позже." }, 503, allowedOrigin);
    }
  }
};

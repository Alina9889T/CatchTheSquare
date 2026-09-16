import { authenticate } from "./auth.mjs";
const json = (value, status = 200) => Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" }
});
const empty = (status = 200, headers = {}) => new Response(null, {
    status, headers: { "Cache-Control": "no-store", ...headers }
});
const validId = id => Number.isSafeInteger(id) && id > 0;
const validScore = score => Number.isInteger(score) && score >= 0 && score <= 2147483647;
const validTheme = theme => theme === "dark" || theme === "light";

async function handleApi(request, env, path) {
    const userMatch = path.match(/^\/api\/user\/(\d+)$/);
    const isWrite = ["/api/user", "/api/score", "/api/theme"].includes(path);
    if (!userMatch && !isWrite) return empty(404);
    const method = userMatch ? "GET" : "POST";
    if (request.method !== method) return empty(405, { Allow: method });

    if (!env.BOT_TOKEN) return json("Authentication is not configured.", 503);
    const telegramUser = await authenticate(request.headers.get("X-Telegram-Init-Data"), env.BOT_TOKEN);
    if (!telegramUser) return json("Invalid or expired Telegram authorization.", 401);

    if (userMatch) {
        const id = Number(userMatch[1]);
        if (!validId(id)) return json("Invalid user id.", 400);
        if (id !== telegramUser.id) return empty(403);
        const user = await env.DB.prepare(
            "SELECT id, username, best_score AS bestScore, theme FROM users WHERE id = ?"
        ).bind(id).first();
        return user ? json(user) : empty(404);
    }

    let model;
    try {
        model = await request.json();
    } catch {
        return json("Invalid JSON.", 400);
    }
    if (!model || typeof model !== "object" || !validId(model.id)) {
        return json("Invalid user id.", 400);
    }
    if (model.id !== telegramUser.id) return empty(403);
    if (path === "/api/user") {
        const username = telegramUser.username ?? null;
        const bestScore = model.bestScore ?? 0;
        const theme = model.theme ?? "dark";
        if ((username !== null && typeof username !== "string") ||
            !validScore(bestScore) || !validTheme(theme)) {
            return json("Invalid user data.", 400);
        }
        // Updating a name must preserve an existing player's score and theme.
        await env.DB.prepare(
            "INSERT INTO users (id, username, best_score, theme) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(id) DO UPDATE SET username = excluded.username"
        ).bind(model.id, username, bestScore, theme).run();
        return empty();
    }
    if (path === "/api/score") {
        if (!validScore(model.bestScore)) return json("Invalid score.", 400);
        // Atomic update prevents concurrent requests from lowering the record.
        const result = await env.DB.prepare(
            "UPDATE users SET best_score = MAX(best_score, ?) WHERE id = ? RETURNING best_score AS bestScore"
        ).bind(model.bestScore, model.id).first();
        return result ? json(result.bestScore) : empty(404);
    }
    if (!validTheme(model.theme)) return json("Theme must be dark or light.", 400);
    const result = await env.DB.prepare(
        "UPDATE users SET theme = ? WHERE id = ? RETURNING theme"
    ).bind(model.theme, model.id).first();
    return result ? json(result.theme) : empty(404);
}

export default {
    async fetch(request, env) {
        const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
        if (path !== "/api" && !path.startsWith("/api/")) return env.ASSETS.fetch(request);
        try {
            return await handleApi(request, env, path);
        } catch (error) {
            console.error("API request failed:", error);
            return json("Internal server error.", 500);
        }
    }
};
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import worker from "./worker.mjs";
import { authenticate } from "./auth.mjs";
import { sign, TEST_TOKEN } from "./test-helpers.mjs";
const now = Math.floor(Date.now() / 1000);
const user = { id: 123, username: "real_user" };
const valid = sign(user, { date: now, extra: { signature: "signed-extra-field", query_id: "a+b/c" } });
assert.deepEqual(await authenticate(valid, TEST_TOKEN, now), user);
for (const value of [
    "", "hash=xyz", valid.replace("real_user", "fake_user"),
    sign(user, { token: "wrong-token" }),
    sign(user, { date: now - 86401 }),
    sign(user, { date: now + 61 }),
    sign({ id: -1 }),
    sign(user, { extra: { user: "invalid-json" } }),
    valid + "&auth_date=" + now
]) assert.equal(await authenticate(value, TEST_TOKEN, now), null);
const db = new DatabaseSync(":memory:");
db.exec(await readFile(new URL("./migrations/0001_create_users.sql", import.meta.url), "utf8"));
const env = {
    BOT_TOKEN: TEST_TOKEN,
    DB: { prepare(sql) {
        return { bind(...args) {
            const statement = db.prepare(sql);
            return { async first() { return statement.get(...args) ?? null; }, async run() { return statement.run(...args); } };
        }};
    }},
    ASSETS: { async fetch(request) {
        const path = new URL(request.url).pathname;
        const file = { "/": "index.html", "/script.js": "script.js", "/style.css": "style.css" }[path];
        return file ? new Response(await readFile(new URL("../wwwroot/" + file, import.meta.url))) : new Response(null, { status: 404 });
    }}
};
const request = (path, data, initData = valid) => new Request("http://127.0.0.1:8787" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { "X-Telegram-Init-Data": initData, "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data)
});
for (const [path, data] of [
    ["/api/user/999", undefined], ["/api/user", { id: 999 }],
    ["/api/score", { id: 999, bestScore: 5 }], ["/api/theme", { id: 999, theme: "light" }]
]) {
    assert.equal((await worker.fetch(request(path, data), env)).status, 403);
    assert.equal((await worker.fetch(request(path, data, ""), env)).status, 401);
}
assert.equal((await worker.fetch(request("/api/user/123"), { ...env, BOT_TOKEN: undefined })).status, 503);
await worker.fetch(request("/api/user", { id: 123, username: "forged_name" }), env);
assert.equal((await (await worker.fetch(request("/api/user/123"), env)).json()).username, "real_user");
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => worker.fetch(new Request(url, options), env);
try { await import("./api.test.mjs"); } finally { globalThis.fetch = originalFetch; db.close(); }
console.log("PASS: Telegram HMAC, tampering, expiry, future date, duplicate fields, wrong bot, malformed user, all-route access control, trusted username, missing secret.");
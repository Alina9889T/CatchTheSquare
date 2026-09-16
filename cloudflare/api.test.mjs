import { sign } from "./test-helpers.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = "http://127.0.0.1:8787";
const id = Date.now();
let username = "Test'Name";
async function api(path, data, status = 200) {
    const response = await fetch(base + path, data === undefined ? { headers: { "X-Telegram-Init-Data": sign({ id, username }) } } : {
        method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": sign({ id, username }) }, body: JSON.stringify(data)
    });
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const text = await response.text();
    return text ? JSON.parse(text) : null;
}
await api("/api/user/" + id, undefined, 404);
await api("/api/score", { id, bestScore: 5 }, 404);
await api("/api/theme", { id, theme: "light" }, 404);
await api("/api/user", { id, username: "Test'Name" });
assert.deepEqual(await api("/api/user/" + id), { id, username: "Test'Name", bestScore: 0, theme: "dark" });
assert.equal(await api("/api/score", { id, bestScore: 20 }), 20);
assert.equal(await api("/api/score", { id, bestScore: 3 }), 20);
assert.equal(await api("/api/theme", { id, theme: "light" }), "light");
username = "Renamed";
await api("/api/user", { id, username: "Renamed", bestScore: 0, theme: "dark" });
assert.deepEqual(await api("/api/user/" + id), { id, username: "Renamed", bestScore: 20, theme: "light" });
await Promise.all([35, 90, 40, 21].map(bestScore => api("/api/score", { id, bestScore })));
assert.equal((await api("/api/user/" + id)).bestScore, 90);
await api("/api/theme", { id, theme: "invalid" }, 400);
await api("/api/score", { id, bestScore: -1 }, 400);
await api("/api/user", { id: "bad" }, 400);
await api("/api/user", undefined, 405);
await api("/api/missing", undefined, 404);
const malformed = await fetch(base + "/api/user", { method: "POST", headers: { "X-Telegram-Init-Data": sign({ id, username }) }, body: "{" });
assert.equal(malformed.status, 400);
for (const [url, file] of [["/", "index.html"], ["/script.js?v=9", "script.js"], ["/style.css?v=6", "style.css"]]) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), await readFile(new URL("../wwwroot/" + file, import.meta.url), "utf8"));
}
assert.equal((await fetch(base + "/users.json")).status, 404);
console.log("PASS: four API routes, defaults, rename preservation, concurrent records, validation, status codes, static assets, private file isolation.");
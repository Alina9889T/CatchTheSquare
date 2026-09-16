const encoder = new TextEncoder();
const MAX_AGE = 24 * 60 * 60;
const CLOCK_SKEW = 60;

// Telegram bot-token validation: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export async function authenticate(initData, botToken, now = Math.floor(Date.now() / 1000)) {
    if (!initData || initData.length > 16384) return null;
    const params = new URLSearchParams(initData);
    if (new Set(params.keys()).size !== [...params.keys()].length) return null;
    const hash = params.get("hash");
    if (!/^[a-f0-9]{64}$/i.test(hash ?? "")) return null;
    params.delete("hash");
    params.sort();
    const checkString = [...params].map(([key, value]) => key + "=" + value).join("\n");
    const derivationKey = await crypto.subtle.importKey(
        "raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const secret = await crypto.subtle.sign("HMAC", derivationKey, encoder.encode(botToken));
    const verificationKey = await crypto.subtle.importKey(
        "raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const signature = Uint8Array.from(hash.match(/../g), byte => parseInt(byte, 16));
    if (!await crypto.subtle.verify("HMAC", verificationKey, signature, encoder.encode(checkString))) return null;
    const date = params.get("auth_date");
    if (!/^\d+$/.test(date ?? "")) return null;
    const age = now - Number(date);
    if (!Number.isSafeInteger(Number(date)) || age > MAX_AGE || age < -CLOCK_SKEW) return null;
    try {
        const user = JSON.parse(params.get("user"));
        if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
        if (user.username !== undefined && typeof user.username !== "string") return null;
        return user;
    } catch {
        return null;
    }
}
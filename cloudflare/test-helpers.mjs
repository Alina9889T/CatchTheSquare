import { createHmac } from "node:crypto";
export const TEST_TOKEN = "123456:local-test-token-not-a-real-bot";
export function sign(user, { token = TEST_TOKEN, date = Math.floor(Date.now() / 1000), extra = {} } = {}) {
    const fields = new URLSearchParams({ user: JSON.stringify(user), auth_date: String(date), ...extra });
    fields.sort();
    const secret = createHmac("sha256", "WebAppData").update(token).digest();
    fields.set("hash", createHmac("sha256", secret).update([...fields].map(([k,v]) => k + "=" + v).join("\n")).digest("hex"));
    return fields.toString();
}
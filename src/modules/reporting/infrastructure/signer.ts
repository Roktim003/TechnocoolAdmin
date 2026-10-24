import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/shared/config/env";
import type { LinkSigner } from "../application/ports";

/** HMAC-SHA256 over path + expiry, keyed from the server secret (a link can't be forged or extended). */
const key = () => `${env().JWT_ACCESS_SECRET}:report-download`;
const mac = (path: string, expires: string) => createHmac("sha256", key()).update(`${path}\n${expires}`).digest("hex");

export const hmacLinkSigner: LinkSigner = {
  sign(path, expiresAt) {
    const expires = String(expiresAt.getTime());
    return `${path}?expires=${expires}&signature=${mac(path, expires)}`;
  },
  verify(path, expires, signature) {
    if (!expires || !signature || !/^\d{10,16}$/.test(expires) || !/^[0-9a-f]{64}$/.test(signature)) return false;
    if (Number(expires) < Date.now()) return false;
    const a = Buffer.from(mac(path, expires), "hex");
    const b = Buffer.from(signature, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  },
};

import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fcmPushSender } from "@/modules/notifications/infrastructure/fcm-push-sender";
import type { PushMessage } from "@/modules/notifications/application/ports";
import { parseServiceAccount } from "@/shared/config/env";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const account = { projectId: "stockbook-test", clientEmail: "push@stockbook-test.iam.gserviceaccount.com", privateKey, tokenUri: "https://oauth.test/token" };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fcmError = (status: number, code: string, errorCode?: string, message = "error") => json(status, { error: { code: status, status: code, message, details: errorCode ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] : [] } });

/** A fake Google: the token endpoint checks the signed JWT; the send endpoint answers per device token. */
function fakeGoogle(answer: (token: string) => Response = () => json(200, { name: "projects/stockbook-test/messages/1" })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === account.tokenUri) {
      const assertion = new URLSearchParams(String(init.body)).get("assertion")!;
      const [h, c, s] = assertion.split(".");
      const valid = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s!, "base64url"));
      const claims = JSON.parse(Buffer.from(c!, "base64url").toString());
      if (!valid || claims.iss !== account.clientEmail || claims.aud !== account.tokenUri || claims.scope !== "https://www.googleapis.com/auth/firebase.messaging") return json(400, { error: "invalid_grant" });
      return json(200, { access_token: `ya29.${calls.length}`, expires_in: 3600 });
    }
    return answer(JSON.parse(String(init.body)).message.token);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const msg = (token = "device-token-0000000001"): PushMessage => ({ token, title: "GRN-I-2627-0003 needs verification", body: "Submitted by Rahim, Warehouse A", data: { notificationId: "n1", type: "STOCK_ENTRY_SUBMITTED", link: "/stock/e1" }, badge: 3 });

describe("FCM_SERVICE_ACCOUNT", () => {
  const file = { type: "service_account", project_id: "stockbook-prod", client_email: "x@stockbook-prod.iam.gserviceaccount.com", private_key: privateKey.replace(/\n/g, "\\n"), token_uri: "https://oauth2.googleapis.com/token" };

  it("accepts the key file as JSON or base64, with escaped newlines in the key", () => {
    const fromJson = parseServiceAccount(JSON.stringify(file));
    expect(fromJson).toEqual({ projectId: "stockbook-prod", clientEmail: file.client_email, privateKey, tokenUri: "https://oauth2.googleapis.com/token" });
    expect(parseServiceAccount(Buffer.from(JSON.stringify(file)).toString("base64"))).toEqual(fromJson);
    const { token_uri: _t, ...noUri } = file;
    expect(parseServiceAccount(JSON.stringify(noUri))?.tokenUri).toBe("https://oauth2.googleapis.com/token");
  });

  it("rejects anything else", () => {
    expect(parseServiceAccount("not json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ ...file, private_key: "" }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ ...file, project_id: undefined }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ ...file, private_key: "abc" }))).toBeNull();
  });
});

describe("FCM push sender", () => {
  it("is off without a service account", async () => {
    const s = fcmPushSender({ account: undefined });
    expect(s.configured).toBe(false);
    expect(await s.send(msg())).toMatchObject({ ok: false, retryable: false, invalidToken: false });
  });

  it("signs in with a signed JWT, caches the access token and sends the HTTP v1 message", async () => {
    const g = fakeGoogle();
    const s = fcmPushSender({ account, fetch: g.fetch });
    expect(await s.send(msg())).toEqual({ ok: true });
    expect(await s.send(msg("device-token-0000000002"))).toEqual({ ok: true });
    expect(g.calls.filter((c) => c.url === account.tokenUri)).toHaveLength(1); // cached
    const send = g.calls.find((c) => c.url !== account.tokenUri)!;
    expect(send.url).toBe("https://fcm.googleapis.com/v1/projects/stockbook-test/messages:send");
    expect((send.init.headers as Record<string, string>).authorization).toBe("Bearer ya29.1");
    expect(JSON.parse(String(send.init.body)).message).toEqual({
      token: "device-token-0000000001",
      notification: { title: "GRN-I-2627-0003 needs verification", body: "Submitted by Rahim, Warehouse A" },
      data: { notificationId: "n1", type: "STOCK_ENTRY_SUBMITTED", link: "/stock/e1" },
      android: { priority: "HIGH", notification: { sound: "default" } },
      apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default", badge: 3 } } },
    });
  });

  it("signs in again when the access token is about to expire", async () => {
    let t = 1_000_000;
    const g = fakeGoogle();
    const s = fcmPushSender({ account, fetch: g.fetch, now: () => t });
    await s.send(msg());
    t += 3600_000 - 30_000; // within a minute of expiry
    await s.send(msg());
    expect(g.calls.filter((c) => c.url === account.tokenUri)).toHaveLength(2);
  });

  it("maps FCM errors: dead tokens, temporary failures, and the rest", async () => {
    const g = fakeGoogle((token) => {
      if (token === "dead") return fcmError(404, "NOT_FOUND", "UNREGISTERED", "Requested entity was not found.");
      if (token === "garbled") return fcmError(400, "INVALID_ARGUMENT", "INVALID_ARGUMENT", "The registration token is not a valid FCM registration token");
      if (token === "other-project") return fcmError(403, "PERMISSION_DENIED", "SENDER_ID_MISMATCH");
      if (token === "busy") return fcmError(503, "UNAVAILABLE", "UNAVAILABLE");
      if (token === "quota") return fcmError(429, "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED");
      if (token === "payload") return fcmError(400, "INVALID_ARGUMENT", "INVALID_ARGUMENT", "Invalid value at 'message.data'");
      return json(200, {});
    });
    const s = fcmPushSender({ account, fetch: g.fetch });
    expect(await s.send(msg("dead"))).toMatchObject({ ok: false, invalidToken: true, retryable: false, error: expect.stringContaining("UNREGISTERED") });
    expect(await s.send(msg("garbled"))).toMatchObject({ invalidToken: true, retryable: false });
    expect(await s.send(msg("other-project"))).toMatchObject({ invalidToken: true });
    expect(await s.send(msg("busy"))).toMatchObject({ invalidToken: false, retryable: true });
    expect(await s.send(msg("quota"))).toMatchObject({ invalidToken: false, retryable: true });
    expect(await s.send(msg("payload"))).toMatchObject({ invalidToken: false, retryable: false });
  });

  it("network errors retry; a rejected sign-in doesn't", async () => {
    const down = fcmPushSender({ account, fetch: (async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch });
    expect(await down.send(msg())).toMatchObject({ ok: false, retryable: true, invalidToken: false });
    const wrongKey = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
    const bad = fcmPushSender({ account: { ...account, privateKey: wrongKey }, fetch: fakeGoogle().fetch });
    expect(await bad.send(msg())).toMatchObject({ ok: false, retryable: false, error: expect.stringContaining("invalid_grant") });
  });
});

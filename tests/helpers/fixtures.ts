import * as loginRoute from "@/app/api/v1/auth/login/route";
import * as usersRoute from "@/app/api/v1/users/route";
import { TEST_ENV } from "../setup/test-env";
import { call } from "./http";
import { roleId, warehouseId } from "./db";

export const ADMIN = { username: TEST_ENV.ADMIN_USERNAME!, password: TEST_ENV.ADMIN_PASSWORD! };

export interface MobileSession {
  accessToken: string;
  refreshToken: string;
  me: any;
}

export async function loginMobile(username: string, password: string): Promise<MobileSession> {
  const res = await call(loginRoute.POST, "POST", "/auth/login", { body: { username, password, client: "mobile" } });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function loginWeb(username: string, password: string): Promise<{ sb_at: string; sb_rt: string }> {
  const res = await call(loginRoute.POST, "POST", "/auth/login", { body: { username, password } });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status}`);
  return { sb_at: res.setCookies.sb_at!, sb_rt: res.setCookies.sb_rt! };
}

export const adminToken = async () => (await loginMobile(ADMIN.username, ADMIN.password)).accessToken;

let counter = 0;

/** Creates a user through the API as Admin. */
export async function createUser(
  token: string,
  overrides: Partial<{ username: string; name: string; password: string; role: string; warehouses: string[]; phone: string; email: string }> = {},
) {
  counter++;
  const body = {
    name: overrides.name ?? `Test User ${counter}`,
    username: overrides.username ?? `user${counter}`,
    password: overrides.password ?? "Password-123",
    roleId: await roleId(overrides.role ?? "Store Manager"),
    warehouseIds: await Promise.all((overrides.warehouses ?? ["A"]).map(warehouseId)),
    ...(overrides.phone ? { phone: overrides.phone } : {}),
    ...(overrides.email ? { email: overrides.email } : {}),
  };
  const res = await call(usersRoute.POST, "POST", "/users", { token, body });
  if (res.status !== 201) throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body.data, password: body.password } as { id: string; username: string; password: string; [k: string]: any };
}

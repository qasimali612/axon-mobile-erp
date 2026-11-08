import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.OPERATIONS_TEST_BASE_URL || "http://127.0.0.1:3000";
const run = Date.now().toString(36);
const email = `login-acceptance-${run}@example.invalid`;
const password = `Acceptance-${randomBytes(12).toString("base64url")}!`;
const userAgent = `Axon-Login-Acceptance/${run}`;
let userId: string | null = null;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function main() {
  const company = await prisma.company.findUniqueOrThrow({ where: { code: "AXON" } });
  const role = await prisma.role.findFirstOrThrow({ where: { companyId: company.id, isActive: true, permissions: { some: { permission: { key: "dashboard.view" } } } } });
  const user = await prisma.user.create({ data: { email, fullName: "Login Acceptance User", passwordHash: await bcrypt.hash(password, 12), status: "ACTIVE", forcePasswordChange: false, memberships: { create: { companyId: company.id, employeeCode: `LAT-${run}`.slice(0, 30), status: "ACTIVE", userRoles: { create: { roleId: role.id } } } } } });
  userId = user.id;

  const login = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { Origin: baseUrl, "Content-Type": "application/json", "User-Agent": userAgent, "X-Forwarded-For": `198.51.100.${Number.parseInt(run.slice(-2), 36) % 200 + 1}` }, body: JSON.stringify({ email, password }), redirect: "manual" });
  const loginText = await login.text(); assert(login.status === 200, `Login failed with ${login.status}: ${loginText}`);
  const setCookies = login.headers.getSetCookie();
  assert(setCookies.some((value) => value.startsWith("axon_session=")), "Primary HttpOnly session cookie was not set.");
  if (process.env.EXPECT_PREVIEW_COOKIE === "true") {
    const preview = setCookies.find((value) => value.startsWith("axon_preview_session="));
    assert(preview, "Partitioned preview session cookie was not set.");
    assert(/SameSite=None/i.test(preview) && /Secure/i.test(preview) && /Partitioned/i.test(preview), "Preview cookie is missing SameSite=None, Secure, or Partitioned.");
  }
  const cookie = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie, "User-Agent": userAgent } });
  const meBody = await me.json(); assert(me.status === 200 && meBody.data.user.email === email, "Fresh session was not recognized by the authenticated API.");
  const dashboard = await fetch(`${baseUrl}/`, { headers: { Cookie: cookie, "User-Agent": userAgent }, redirect: "manual" });
  const dashboardText = await dashboard.text(); assert(dashboard.status === 200 && dashboardText.includes("Login Acceptance User"), `Dashboard did not retain the signed-in session (${dashboard.status}).`);
  console.log("✓ login sets the secure session cookie, /api/auth/me recognizes it, and dashboard navigation remains authenticated");
  if (process.env.EXPECT_PREVIEW_COOKIE === "true") console.log("✓ embedded preview receives a Secure, SameSite=None, Partitioned fallback cookie");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (userId) {
    await prisma.auditLog.deleteMany({ where: { actorId: userId } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.companyMembership.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  await prisma.loginAttempt.deleteMany({ where: { email } }).catch(() => undefined);
  await prisma.$disconnect();
});

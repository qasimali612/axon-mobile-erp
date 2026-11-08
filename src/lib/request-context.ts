import { headers } from "next/headers";

export async function requestMetadata() {
  const requestHeaders = await headers();
  return {
    ipAddress:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip") ||
      "unknown",
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) || "unknown",
    requestId: requestHeaders.get("x-request-id") || crypto.randomUUID(),
  };
}

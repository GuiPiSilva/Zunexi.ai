import { defineHandler } from "nitro";
import { completeMetaOAuth } from "../../../src/lib/social.functions";

export default defineHandler(async (event) => {
  const requestUrl = new URL(event.req.url);
  const appBase = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || requestUrl.origin).replace(/\/+$/, "");
  const target = new URL("/redes", appBase);
  const oauthError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");
  if (oauthError) {
    target.searchParams.set("oauth", "error");
    target.searchParams.set("message", oauthError.slice(0, 300));
    return new Response(null, { status: 302, headers: { Location: target.toString() } });
  }

  try {
    const result = await completeMetaOAuth(
      requestUrl.searchParams.get("code") || "",
      requestUrl.searchParams.get("state") || "",
    );
    target.searchParams.set("oauth", "success");
    target.searchParams.set("connected", String(result.connected));
  } catch (error) {
    target.searchParams.set("oauth", "error");
    target.searchParams.set("message", (error instanceof Error ? error.message : String(error)).slice(0, 300));
  }
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
});

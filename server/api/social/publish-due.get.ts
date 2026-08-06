import { defineHandler } from "nitro";
import { processSocialCron } from "../../../src/lib/social.functions";

export default defineHandler(async (event) => {
  const url = new URL(event.req.url);
  const authorization = event.req.headers.get("authorization") || "";
  const secret = authorization.replace(/^Bearer\s+/i, "").trim() || url.searchParams.get("secret") || "";
  try {
    const report = await processSocialCron(secret);
    return Response.json(report);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 401 });
  }
});

import { defineHandler } from "nitro";
import { ingestMetaWebhook, verifyMetaWebhookSignature } from "../../../src/lib/social.functions";

export default defineHandler(async (event) => {
  const rawBody = await event.req.text();
  if (!verifyMetaWebhookSignature(rawBody, event.req.headers.get("x-hub-signature-256"))) {
    return Response.json({ ok: false, error: "Assinatura inválida." }, { status: 401 });
  }
  try {
    const payload = JSON.parse(rawBody || "{}");
    const result = await ingestMetaWebhook(payload);
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
});

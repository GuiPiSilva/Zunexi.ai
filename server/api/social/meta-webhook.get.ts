import { defineHandler } from "nitro";

export default defineHandler((event) => {
  const url = new URL(event.req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") || "";
  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return Response.json({ ok: false, error: "Verificação do webhook recusada." }, { status: 403 });
});

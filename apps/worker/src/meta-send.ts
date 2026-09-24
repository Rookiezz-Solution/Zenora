// Mirrors the send calls in apps/api/src/channels/meta-graph.client.ts —
// duplicated for the same reason as decrypt-token.ts (worker has no Nest DI
// to inject that client with). Only what the automation engine's send
// blocks need.
function graphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v21.0";
}

async function post(path: string, accessToken: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://graph.facebook.com/${graphApiVersion()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Meta Graph API error (${path}): ${JSON.stringify(body)}`);
  }
  return body;
}

export async function sendInstagramMessage(igUserId: string, recipientId: string, text: string, accessToken: string): Promise<string> {
  const body = (await post(`/${igUserId}/messages`, accessToken, {
    recipient: { id: recipientId },
    message: { text }
  })) as { message_id: string };
  return body.message_id;
}

export async function sendWhatsappText(phoneNumberId: string, to: string, text: string, accessToken: string): Promise<string> {
  const body = (await post(`/${phoneNumberId}/messages`, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text }
  })) as { messages: Array<{ id: string }> };
  return body.messages[0]!.id;
}

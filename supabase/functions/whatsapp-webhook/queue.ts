// ============================================================
// GADU · Cola FIFO de mensajes WhatsApp (anti ráfagas)
// Cada webhook entrante se guarda inmediatamente y se procesa
// en orden (FIFO) por teléfono, evitando perder mensajes cuando
// el usuario escribe varios seguidos en pocos segundos.
// ============================================================

export interface QueueItem {
  id: number;
  phone: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
}

/* Insertar inmediato al recibir el webhook */
export async function enqueueMessage(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
  phone: string,
  payload: unknown,
): Promise<void> {
  await rest("whatsapp_queue", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ phone, payload, status: "pending" }),
  });
}

/* Reclama el siguiente mensaje pendiente (FIFO). Marca 'processing' en la
   misma operación para minimizar que dos drains concurrentes lo dupliquen. */
export async function claimNext(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
  phone: string,
): Promise<QueueItem | null> {
  const r = await rest(
    "whatsapp_queue?status=eq.pending&phone=eq." + encodeURIComponent(phone) +
    "&order=created_at.asc&limit=1",
    { method: "GET" },
  );
  const rows = (await r.json().catch(() => [])) as QueueItem[];
  if (!Array.isArray(rows) || !rows.length) return null;
  const item = rows[0];
  const up = await rest("whatsapp_queue?id=eq." + item.id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "processing", attempts: item.attempts + 1 }),
  });
  return up.ok ? item : null;
}

export async function markDone(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
  id: number,
): Promise<void> {
  await rest("whatsapp_queue?id=eq." + id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "done", processed_at: new Date().toISOString() }),
  });
}

export async function markFailed(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
  id: number,
): Promise<void> {
  await rest("whatsapp_queue?id=eq." + id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "failed", processed_at: new Date().toISOString() }),
  });
}

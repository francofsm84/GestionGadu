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
    body: JSON.stringify({ status: "processing", attempts: item.attempts + 1, claimed_at: new Date().toISOString() }),
  });
  return up.ok ? item : null;
}

/* Libera mensajes 'processing' que quedaron huérfanos (crash) hace más de 3 min.
   Los devuelve a 'pending' para que se reintenten. Devuelve cuántos liberó. */
export async function resetStaleProcessing(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
): Promise<number> {
  const cutoff = new Date(Date.now() - 3 * 60000).toISOString();
  const up = await rest(
    "whatsapp_queue?status=eq.processing&claimed_at=lt." + encodeURIComponent(cutoff) + "&select=id",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "pending", claimed_at: null }),
    },
  );
  const rows = (await up.json().catch(() => [])) as Array<{ id: number }>;
  return Array.isArray(rows) ? rows.length : 0;
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
  /* Marcar 'failed' INMEDIATAMENTE (sin reintentos) para que la cola no se bloquee:
     el drainPhone pasa al siguiente mensaje al instante. */
  await rest("whatsapp_queue?id=eq." + id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "failed", processed_at: new Date().toISOString() }),
  });
}

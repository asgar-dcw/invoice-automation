import type { WebhookPayload, WebhookClient, RunHistoryRecord, ProgressRow } from '../types/invoice';
import { fetchRunHistory } from './googleSheets';

const webhookPath = '/webhook/invoice-automation';

const SPREADSHEET_ID = '1GFZbTMRpLQngThlif3BeCtIMubBEZiS-ZDXepm_EtZ4';

function getSheetsBaseUrl(): string {
  return import.meta.env.DEV ? '/sheets' : 'https://sheets.googleapis.com';
}

export async function triggerInvoiceAutomation(
  payload: WebhookPayload
): Promise<{ executionId: string }> {
  console.log('Triggering webhook:', webhookPath, import.meta.env.DEV ? '(test mode)' : '(production)');

  const res = await fetch(webhookPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Webhook trigger failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  // Webhook responds with a static message; execution ID is rarely real.
  // Progress is tracked via fetchProgress / pollForRunCompletion instead.
  return { executionId: data.executionId || data.execution_id || 'unknown' };
}

/**
 * Fetch the "progress" sheet and return per-client status rows.
 *
 * If a real executionId is provided, rows are filtered to that execution.
 * If the ID is empty or 'unknown' (webhook hasn't returned a real one yet),
 * all rows are returned so that the current run's data is still visible.
 *
 * Last-write-wins: for each client_name, only the row with the latest
 * updated_at is kept.
 */
export async function fetchProgress(executionId: string, triggerTime: number): Promise<ProgressRow[]> {
  const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY;
  const url = `${getSheetsBaseUrl()}/v4/spreadsheets/${SPREADSHEET_ID}/values/progress?key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch progress: ${res.status} ${res.statusText}`);
  }

  const data: { values?: string[][] } = await res.json();
  const rows = data.values;
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const execIdx = headers.indexOf('execution_id');
  const clientIdx = headers.indexOf('client_name');
  const stepIdx = headers.indexOf('step');
  const updatedIdx = headers.indexOf('updated_at');

  const hasRealId = executionId && executionId !== 'unknown';
  const cutoffMs = triggerTime - 30000; // 30s grace, matching pollForRunCompletion

  const allRows: ProgressRow[] = rows
    .slice(1)
    .filter((row) => {
      if (hasRealId && (row[execIdx] ?? '').trim() !== executionId.trim()) return false;
      const updatedMs = new Date(row[updatedIdx] ?? '').getTime();
      if (!isNaN(updatedMs) && updatedMs < cutoffMs) return false;
      return true;
    })
    .map((row) => ({
      client_name: row[clientIdx] ?? '',
      step: (row[stepIdx] ?? 'processing') as ProgressRow['step'],
      updated_at: row[updatedIdx] ?? '',
    }))
    .filter((row) => row.client_name.trim() !== '');

  // Last-write-wins per client_name
  const latestMap = new Map<string, ProgressRow>();
  for (const row of allRows) {
    const key = row.client_name.trim().toLowerCase();
    const existing = latestMap.get(key);
    if (!existing || new Date(row.updated_at) >= new Date(existing.updated_at)) {
      latestMap.set(key, row);
    }
  }

  return Array.from(latestMap.values());
}

/**
 * Poll the "runs" sheet for completion.
 *
 * The n8n workflow writes ONE row at the end of execution (after all drafts are
 * created and the notification email is sent). The row contains ALL client names
 * in `clients_processed` separated by " | ".
 *
 * Polls every 5 seconds. When the matching row appears, calls onRecordFound.
 *
 * @param afterDate - If provided, only match records whose `date` is strictly
 *   newer than this value. Used by the chunked runner to prevent chunk N+1's
 *   poll from accidentally matching chunk N's already-consumed completion record.
 */
export function pollForRunCompletion(
  triggerTime: number,
  triggeredBy: string,
  clientCount: number,
  onRecordFound: (record: RunHistoryRecord) => void,
  onTimeout: () => void,
  afterDate?: string
): () => void {
  const startTime = Date.now();
  const TIMEOUT_MS = Math.max(10 * 60_000, clientCount * 3.5 * 60_000);
  const POLL_INTERVAL = 5000; // 5 seconds
  const afterDateMs = afterDate ? new Date(afterDate).getTime() : null;

  const interval = setInterval(async () => {
    try {
      const elapsed = Date.now() - startTime;
      if (elapsed >= TIMEOUT_MS) {
        clearInterval(interval);
        onTimeout();
        return;
      }

      // Bypass cache for fresh data
      const history = await fetchRunHistory(true);

      // Find row that matches: same triggered_by + appeared after our trigger.
      // If afterDate is set, also require the record to be strictly newer than
      // the previous chunk's completion record so we never re-consume it.
      const matchedRecord = history.find((row) => {
        if (!row.date) return false;
        const rowTime = new Date(row.date).getTime();
        if (afterDateMs !== null && rowTime <= afterDateMs) return false;
        return (
          row.triggered_by.trim().toLowerCase() === triggeredBy.trim().toLowerCase() &&
          rowTime > triggerTime - 30000 // 30s grace for clock skew
        );
      });

      if (matchedRecord) {
        clearInterval(interval);
        onRecordFound(matchedRecord);
      }
    } catch (err) {
      console.error('Error during run completion polling:', err);
    }
  }, POLL_INTERVAL);

  return () => clearInterval(interval);
}

// ---------------------------------------------------------------------------
// Chunked automation
// ---------------------------------------------------------------------------

export interface ChunkResult {
  totalRequested: number;
  totalCompleted: number;
  /** Client names from the chunk that failed or timed out */
  failedClients: string[];
  /** 0-based index of the chunk that failed, if any */
  failedChunkIndex?: number;
}

const CHUNK_SIZE = 5;

/**
 * Wraps pollForRunCompletion as a Promise so it can be awaited inside
 * triggerInvoiceAutomationChunked.
 *
 * @param afterDate - forwarded to pollForRunCompletion; see its JSDoc.
 */
function pollForRunCompletionAsync(
  triggerTime: number,
  triggeredBy: string,
  clientCount: number,
  afterDate?: string
): Promise<RunHistoryRecord> {
  return new Promise((resolve, reject) => {
    pollForRunCompletion(
      triggerTime,
      triggeredBy,
      clientCount,
      (record) => resolve(record),
      () => reject(new Error('timeout')),
      afterDate
    );
  });
}

/**
 * Splits clients into chunks of 5 and triggers each chunk sequentially,
 * waiting for each chunk's n8n run to complete before starting the next.
 *
 * If a chunk fails or times out, processing stops and the result describes
 * which clients were confirmed and which still need to be retried.
 */
export async function triggerInvoiceAutomationChunked(
  clients: WebhookClient[],
  month: string,
  triggeredBy: string,
  onChunkStart: (
    chunkIndex: number,
    totalChunks: number,
    clientsInChunk: WebhookClient[],
    chunkTriggerTime: number
  ) => void,
  onChunkComplete: (
    chunkIndex: number,
    totalChunks: number,
    record: RunHistoryRecord
  ) => void
): Promise<ChunkResult> {
  const chunks: WebhookClient[][] = [];
  for (let i = 0; i < clients.length; i += CHUNK_SIZE) {
    chunks.push(clients.slice(i, i + CHUNK_SIZE));
  }

  const totalChunks = chunks.length;
  let totalCompleted = 0;
  // Tracks the completion record date from the previous chunk so the next
  // chunk's poll cannot accidentally match the same (already-consumed) record.
  let lastRecordDate: string | undefined;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const chunkTriggerTime = Date.now();

    // Timestamp log — confirm in browser dev-tools that successive chunk
    // triggers are separated by minutes, NOT seconds.
    console.log(
      `[chunk ${chunkIndex + 1}/${totalChunks}] triggering at ${new Date().toISOString()} ` +
      `(${chunk.length} clients: ${chunk.map((c) => c.client_name).join(', ')})`
    );

    onChunkStart(chunkIndex, totalChunks, chunk, chunkTriggerTime);

    const payload: WebhookPayload = {
      trigger: 'manual',
      month,
      triggered_by: triggeredBy,
      clients: chunk,
    };

    // Step 1: fire the webhook for this chunk
    try {
      await triggerInvoiceAutomation(payload);
    } catch (err) {
      // Webhook failed — report all remaining clients as unconfirmed
      const failedClients = clients.slice(chunkIndex * CHUNK_SIZE).map((c) => c.client_name);
      return {
        totalRequested: clients.length,
        totalCompleted,
        failedClients,
        failedChunkIndex: chunkIndex,
      };
    }

    // Step 2: wait for this chunk's n8n run to finish before triggering the next.
    // Pass lastRecordDate so the poll ignores any record that was already matched
    // by a previous chunk (prevents the "stale record re-consumption" bug).
    try {
      const record = await pollForRunCompletionAsync(chunkTriggerTime, triggeredBy, chunk.length, lastRecordDate);
      lastRecordDate = record.date; // advance the floor for the next chunk's poll
      console.log(
        `[chunk ${chunkIndex + 1}/${totalChunks}] completed at ${new Date().toISOString()} ` +
        `(record.date=${record.date})`
      );
      totalCompleted += chunk.length;
      onChunkComplete(chunkIndex, totalChunks, record);
    } catch {
      // Timed out waiting — report this chunk's clients as unconfirmed
      const failedClients = chunk.map((c) => c.client_name);
      return {
        totalRequested: clients.length,
        totalCompleted,
        failedClients,
        failedChunkIndex: chunkIndex,
      };
    }
  }

  return {
    totalRequested: clients.length,
    totalCompleted,
    failedClients: [],
  };
}

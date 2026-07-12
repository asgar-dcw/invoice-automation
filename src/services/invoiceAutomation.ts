import type { WebhookPayload, RunHistoryRecord, ProgressRow } from '../types/invoice';
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
 */
export function pollForRunCompletion(
  triggerTime: number,
  triggeredBy: string,
  clientCount: number,
  onRecordFound: (record: RunHistoryRecord) => void,
  onTimeout: () => void
): () => void {
  const startTime = Date.now();
  const TIMEOUT_MS = Math.max(10 * 60_000, clientCount * 3.5 * 60_000);
  const POLL_INTERVAL = 5000; // 5 seconds

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

      // Find row that matches: same triggered_by + appeared after our trigger
      const matchedRecord = history.find((row) => {
        if (!row.date) return false;
        const rowTime = new Date(row.date).getTime();
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

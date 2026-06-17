import type { WebhookPayload, RunHistoryRecord } from '../types/invoice';
import { fetchRunHistory } from './googleSheets';

const webhookPath = '/webhook/invoice-automation';

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
  return { executionId: data.executionId || data.execution_id || 'unknown' };
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
  onRecordFound: (record: RunHistoryRecord) => void,
  onTimeout: () => void
): () => void {
  const startTime = Date.now();
  const TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes
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

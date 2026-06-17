import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import type { ClientProcessingStatus, ClientProcessingStep, RunHistoryRecord } from '../../types/invoice';
import { pollForRunCompletion } from '../../services/invoiceAutomation';

interface RunStatusPanelProps {
  statuses: ClientProcessingStatus[];
  allDone: boolean;
  hasError: boolean;
  triggerTime: number;
  triggeredBy: string;
  completedRecord: RunHistoryRecord | null;
  isTimeout: boolean;
  onComplete?: (record: RunHistoryRecord) => void;
  onTimeout?: () => void;
  onViewHistory?: () => void;
}

function StepIndicator({ step }: { step: ClientProcessingStep }) {
  switch (step) {
    case 'pending':
      return (
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 bg-slate-50 flex items-center justify-center">
          <div className="flex gap-0.5">
            <div className="typing-dot w-1 h-1 rounded-full bg-slate-400" />
            <div className="typing-dot w-1 h-1 rounded-full bg-slate-400" />
            <div className="typing-dot w-1 h-1 rounded-full bg-slate-400" />
          </div>
        </div>
      );
    case 'finding_qb':
      return (
        <div className="w-8 h-8 rounded-full bg-orange-50 border-2 border-orange-200 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
        </div>
      );
    case 'sending_ar':
      return (
        <div className="w-8 h-8 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
        </div>
      );
    case 'draft_created':
      return (
        <div className="w-8 h-8 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center scale-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
      );
    case 'error':
      return (
        <div className="w-8 h-8 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center">
          <AlertCircle className="w-4 h-4 text-red-500" />
        </div>
      );
  }
}

function stepLabel(step: ClientProcessingStep, message: string): string {
  if (message) return message;
  switch (step) {
    case 'pending': return 'Waiting in queue...';
    case 'finding_qb': return 'Getting payment link from QuickBooks...';
    case 'sending_ar': return 'Merging and saving drafts...';
    case 'draft_created': return 'Draft created successfully';
    case 'error': return 'Error occurred';
  }
}

function ProgressBar({ pct, isDone }: { pct: number; isDone: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-600">
          {isDone ? 'Completed' : 'Progress'}
        </span>
        <span className={`font-bold tabular-nums ${isDone ? 'text-emerald-600' : 'text-slate-900'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full progress-bar-fill transition-all duration-700 ease-out ${
            isDone
              ? 'bg-gradient-to-r from-emerald-500 to-green-500 progress-bar-done'
              : 'bg-gradient-to-r from-orange-500 to-red-500 progress-bar-active'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ['#FF6B35', '#FFC700', '#4CAF50', '#00BCD4', '#ea580c', '#7c3aed'];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-${Math.random() * 20}px`,
            backgroundColor: colors[i % colors.length],
            animationDelay: `${Math.random() * 0.8}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Actual n8n workflow steps per client:
 *   1. Find QB Invoice ID  (~5s)
 *   2. Read AR Inbox       (~5s)
 *   3. Prepare Draft Data  (~3s)
 *   4. Create Draft        (~5s)
 * Total: ~40s per client + ~15s overhead for Harvest fetch + notification
 */
const PER_CLIENT_SECONDS = 40;
const OVERHEAD_SECONDS = 15; // Harvest fetch + Notify + Log

export default function RunStatusPanel({
  statuses,
  allDone,
  hasError,
  triggerTime,
  triggeredBy,
  completedRecord,
  isTimeout,
  onComplete,
  onTimeout,
  onViewHistory,
}: RunStatusPanelProps) {
  const totalClients = statuses.length;
  const estimatedDuration = OVERHEAD_SECONDS + totalClients * PER_CLIENT_SECONDS;

  const [now, setNow] = useState(Date.now());

  // Stable refs so polling doesn't re-subscribe on every render
  const onCompleteRef = useRef(onComplete);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  // Poll "runs" sheet for the completion row
  useEffect(() => {
    if (allDone) return;

    const unsubscribe = pollForRunCompletion(
      triggerTime,
      triggeredBy,
      (record) => onCompleteRef.current?.(record),
      () => onTimeoutRef.current?.()
    );

    return () => unsubscribe();
  }, [allDone, triggerTime, triggeredBy]);

  // Tick timer for elapsed counter + progress animation
  useEffect(() => {
    if (allDone || isTimeout) return;

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [allDone, isTimeout]);

  const elapsedSeconds = triggerTime > 0 ? Math.max(0, Math.floor((now - triggerTime) / 1000)) : 0;

  // --- PROGRESS CALCULATION ---
  // Asymptotic curve: f(t) = 98 * (1 - e^(-2.5t / E))
  //   - Starts fast, never stops, approaches 98%
  //   - At t=E:  ~92%
  //   - At t=2E: ~99%
  // Jumps to 100% only when all clients are done.
  const rawPct = 98 * (1 - Math.exp(-2.5 * elapsedSeconds / Math.max(estimatedDuration, 1)));
  const estimatedPct = Math.min(98, Math.round(rawPct));

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // --- PER-CLIENT STATUS DERIVATION ---
  // Maps elapsed time to the actual n8n workflow steps per client.
  const derivedStatuses: ClientProcessingStatus[] = (() => {
    if (allDone && hasError) return statuses;

    if (allDone) {
      return statuses.map((s) => ({
        ...s,
        step: 'draft_created' as const,
        message: 'Draft created successfully',
      }));
    }

    // Time-based simulation matching actual n8n nodes:
    //   Per client: Find QB (28%) → Read AR Inbox (25%) → Prepare Draft (17%) → Create Draft (30%)
    // First ~OVERHEAD/2 seconds are spent on Harvest fetch (before per-client loop starts)
    const loopStart = OVERHEAD_SECONDS / 2; // seconds before the per-client loop begins

    return statuses.map((s, idx) => {
      const clientStart = loopStart + idx * PER_CLIENT_SECONDS;
      const clientEnd = clientStart + PER_CLIENT_SECONDS;

      // Client hasn't started yet
      if (elapsedSeconds < clientStart) {
        return { ...s, step: 'pending' as const, message: 'Waiting in queue...' };
      }

      // Client is fully done (estimated)
      if (elapsedSeconds >= clientEnd) {
        return { ...s, step: 'draft_created' as const, message: 'Draft created successfully' };
      }

      // Client is in progress — map to actual workflow step
      const clientElapsed = elapsedSeconds - clientStart;
      const pctThrough = (clientElapsed / PER_CLIENT_SECONDS) * 100;

      let step: ClientProcessingStep;
      let message: string;

      if (pctThrough < 25) {
        // QuickBooks lookup + Gmail AR inbox poll (~10s)
        step = 'finding_qb';
        message = 'Getting payment link from QuickBooks...';
      } else {
        // Draft data preparation + Gmail API call (~30s)
        step = 'sending_ar';
        message = 'Merging and saving drafts...';
      }

      return { ...s, step, message };
    });
  })();

  const currentClientIndex = derivedStatuses.findIndex(
    (s) => s.step === 'finding_qb' || s.step === 'sending_ar'
  );

  const processedClientsList = completedRecord
    ? completedRecord.clients_processed.split(' | ').map((c) => c.trim()).filter(Boolean)
    : statuses.map((s) => s.client_name);

  const doneCount = derivedStatuses.filter((s) => s.step === 'draft_created').length;

  // Check if all individual clients are done (time-based simulation finished)
  // even before the external allDone confirmation arrives from polling
  const allClientsIndividuallyDone = totalClients > 0 && derivedStatuses.every(
    (s) => s.step === 'draft_created' || s.step === 'error'
  );
  const effectivelyDone = allDone || allClientsIndividuallyDone;
  const pct = effectivelyDone ? 100 : estimatedPct;

  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden slide-up">
      {effectivelyDone && !hasError && <Confetti />}

      <div className="p-6 space-y-5 relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl shadow-lg ${
              effectivelyDone
                ? hasError
                  ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/25'
                  : 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/25'
                : isTimeout
                  ? 'bg-gradient-to-br from-amber-500 to-yellow-600 shadow-amber-500/25'
                  : 'bg-gradient-to-br from-orange-500 to-red-500 shadow-orange-500/25'
            }`}>
              {effectivelyDone ? (
                hasError ? (
                  <AlertCircle className="w-5 h-5 text-white" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-white scale-in" />
                )
              ) : isTimeout ? (
                <AlertCircle className="w-5 h-5 text-white" />
              ) : (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-900">
                {effectivelyDone
                  ? hasError
                    ? 'Completed with Errors'
                    : 'All Done!'
                  : isTimeout
                    ? 'Taking longer than expected'
                    : 'Processing Invoices'}
              </h3>
              <div className="text-sm text-slate-500 flex items-center gap-2 flex-wrap min-h-[20px]">
                {effectivelyDone ? (
                  hasError ? (
                    <span>Completed with errors</span>
                  ) : (
                    <>
                      <span>All {totalClients} drafts ready!</span>
                      {completedRecord && completedRecord.total_amount > 0 && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span className="font-bold text-slate-700">
                            ${completedRecord.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </>
                      )}
                    </>
                  )
                ) : isTimeout ? (
                  <span>Please check Gmail drafts directly</span>
                ) : (
                  <>
                    <span className="font-medium text-slate-700">
                      {elapsedSeconds < 3.5
                        ? 'Reading config file...'
                        : elapsedSeconds < 7.5
                          ? 'Getting invoices from Harvest...'
                          : currentClientIndex >= 0
                            ? `Processing client ${currentClientIndex + 1} of ${totalClients}`
                            : doneCount === totalClients
                              ? 'Finalizing run...'
                              : `Starting (${doneCount} of ${totalClients} done)`}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="font-semibold text-orange-600 tabular-nums">
                      {formatTime(elapsedSeconds)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {effectivelyDone && !hasError && (
            <a
              href="https://mail.google.com/mail/u/0/#drafts"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-sm rounded-xl hover:bg-emerald-100 transition-colors scale-in"
            >
              Open Gmail Drafts
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Progress Bar */}
        <ProgressBar pct={pct} isDone={effectivelyDone && !hasError} />

        {/* Timeout Warning */}
        {isTimeout && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl slide-down">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 font-medium flex-1">
              Taking longer than expected — please check Gmail drafts directly.
            </p>
            <a
              href="https://mail.google.com/mail/u/0/#drafts"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white font-semibold text-xs rounded-lg hover:bg-amber-700 transition-colors"
            >
              Open Gmail Drafts
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Post-Run Summary Card */}
        {effectivelyDone && !hasError && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 slide-down">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">
                  {processedClientsList.length} drafts are ready for review in the AR inbox
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  These are DRAFTS. Review details and click Send inside Gmail when ready.
                </p>
              </div>
              {completedRecord && completedRecord.total_amount > 0 && (
                <div className="text-right">
                  <p className="text-xs text-slate-400">Total Amount</p>
                  <p className="text-lg font-bold text-slate-800 tabular-nums">
                    ${completedRecord.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-2">
              {processedClientsList.map((clientName) => (
                <div key={clientName} className="flex items-center justify-between bg-white px-3 py-2.5 rounded-lg border border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span className="font-semibold text-slate-800">{clientName}</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">Draft created</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-semibold">
                    Pending review & send
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <a
                href="https://mail.google.com/mail/u/0/#drafts"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-sm rounded-xl hover:opacity-90 shadow-md shadow-orange-500/15 transition-all"
              >
                Open Gmail Drafts
                <ExternalLink className="w-4 h-4" />
              </a>
              {onViewHistory && (
                <button
                  type="button"
                  onClick={onViewHistory}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold text-sm rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors text-center"
                >
                  View Run History
                </button>
              )}
            </div>
          </div>
        )}

        {/* Per-client status list (while running) */}
        {!effectivelyDone && (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {derivedStatuses.map((s, idx) => {
              const isProcessing = s.step === 'finding_qb' || s.step === 'sending_ar';
              return (
                <div
                  key={s.client_name}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    s.step === 'draft_created'
                      ? 'bg-emerald-50/50 border-emerald-100'
                      : s.step === 'error'
                        ? 'bg-red-50/50 border-red-100'
                        : s.step === 'pending'
                          ? 'bg-slate-50/50 border-slate-100'
                          : 'bg-orange-50/30 border-orange-100'
                  }`}
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <StepIndicator step={s.step} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{s.client_name}</p>
                    <p className={`text-xs mt-0.5 ${
                      s.step === 'error'
                        ? 'text-red-600'
                        : isProcessing
                          ? 'text-orange-500 font-semibold animate-pulse'
                          : s.step === 'draft_created'
                            ? 'text-emerald-600 font-medium'
                            : 'text-slate-500'
                    }`}>
                      {stepLabel(s.step, s.message)}
                    </p>
                    {s.error && (
                      <p className="text-xs text-red-600 mt-1 font-medium">{s.error}</p>
                    )}
                  </div>
                  {s.step === 'draft_created' && (
                    <span className="badge-success text-[10px]">Done</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

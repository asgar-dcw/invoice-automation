import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import type { ClientProcessingStatus, ClientProcessingStep, RunHistoryRecord, ProgressRow } from '../../types/invoice';
import { pollForRunCompletion, fetchProgress } from '../../services/invoiceAutomation';

interface RunStatusPanelProps {
  statuses: ClientProcessingStatus[];
  allDone: boolean;
  hasError: boolean;
  triggerTime: number;
  triggeredBy: string;
  executionId: string;
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
    case 'skipped':
      return (
        <div className="w-8 h-8 rounded-full bg-amber-50 border-2 border-amber-300 flex items-center justify-center">
          <AlertCircle className="w-4 h-4 text-amber-500" />
        </div>
      );
    case 'new_client_needs_harvest_copy':
      return (
        <div className="w-8 h-8 rounded-full bg-yellow-50 border-2 border-yellow-300 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
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
    case 'skipped': return 'Skipped – Automatic send failed, needs review';
    case 'new_client_needs_harvest_copy': return 'Not in QuickBooks — copy from Harvest';
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

export default function RunStatusPanel({
  statuses,
  allDone,
  hasError,
  triggerTime,
  triggeredBy,
  executionId,
  completedRecord,
  isTimeout,
  onComplete,
  onTimeout,
  onViewHistory,
}: RunStatusPanelProps) {
  const totalClients = statuses.length;

  const [now, setNow] = useState(Date.now());
  const [progressRows, setProgressRows] = useState<ProgressRow[]>([]);

  // Stable refs so polling callbacks don't re-subscribe on every render
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
      totalClients,
      (record) => onCompleteRef.current?.(record),
      () => onTimeoutRef.current?.()
    );

    return () => unsubscribe();
  }, [allDone, triggerTime, triggeredBy]);

  // Poll "progress" sheet every 5 s for real per-client status
  useEffect(() => {
    if (allDone || isTimeout) return;

    const poll = async () => {
      try {
        const rows = await fetchProgress(executionId, triggerTime);
        setProgressRows(rows);
      } catch (err) {
        console.error('Error fetching progress:', err);
      }
    };

    // Kick off immediately, then every 5 s
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [allDone, isTimeout, executionId, triggerTime]);

  // Tick timer for elapsed counter display
  useEffect(() => {
    if (allDone || isTimeout) return;

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [allDone, isTimeout]);

  const elapsedSeconds = triggerTime > 0 ? Math.max(0, Math.floor((now - triggerTime) / 1000)) : 0;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // --- PER-CLIENT STATUS FROM REAL PROGRESS DATA ---
  const DONE_STEPS: ClientProcessingStep[] = [
    'draft_created',
    'skipped',
    'new_client_needs_harvest_copy',
    'error',
  ];

  const derivedStatuses: ClientProcessingStatus[] = (() => {
    if (allDone && hasError) return statuses;

    return statuses.map((s) => {
      // Check progressRows for terminal states that override the default mapping.
      const row = progressRows.find(
        (r) => r.client_name.trim().toLowerCase() === s.client_name.trim().toLowerCase()
      );

      if (row?.step === 'new_client_needs_harvest_copy') {
        return { ...s, step: 'new_client_needs_harvest_copy' as const, message: 'Not in QuickBooks — copy from Harvest' };
      }

      if (allDone) {
        // When the run is complete, check progressRows for skipped before
        // defaulting everyone else to draft_created.
        if (s.step === 'skipped' || s.step === 'error') return s;
        if (row?.step === 'skipped') return { ...s, step: 'skipped' as const, message: 'Skipped – Automatic send failed, needs review' };
        return { ...s, step: 'draft_created' as const, message: 'Draft created successfully' };
      }

      if (!row) {
        return { ...s, step: 'pending' as const, message: 'Waiting in queue...' };
      }

      switch (row.step) {
        case 'processing':
          return { ...s, step: 'sending_ar' as const, message: 'Processing invoice...' };
        case 'draft_created':
          return { ...s, step: 'draft_created' as const, message: 'Draft created successfully' };
        case 'skipped':
          return { ...s, step: 'skipped' as const, message: 'Skipped – Automatic send failed, needs review' };
        default:
          return { ...s, step: 'pending' as const, message: 'Waiting in queue...' };
      }
    });
  })();
  const doneCount = derivedStatuses.filter((s) => DONE_STEPS.includes(s.step)).length;

  const currentClientIndex = derivedStatuses.findIndex((s) => s.step === 'sending_ar');

  // Consider the run done if real progress shows all clients have reached a terminal state.
  const allClientsIndividuallyDone =
    totalClients > 0 && derivedStatuses.every((s) => DONE_STEPS.includes(s.step));

  const effectivelyDone = allDone || allClientsIndividuallyDone;

  // Weighted percentage so the bar moves as soon as the first client starts processing:
  //   pending          -> 0.0
  //   sending_ar       -> 0.5  (actively processing)
  //   draft_created / skipped / error -> 1.0
  const weightedSum = derivedStatuses.reduce((sum, s) => {
    if (DONE_STEPS.includes(s.step)) return sum + 1.0;
    if (s.step === 'sending_ar') return sum + 0.5;
    return sum; // pending / finding_qb -> 0
  }, 0);
  const pct = effectivelyDone
    ? 100
    : totalClients > 0
      ? Math.round((weightedSum / totalClients) * 100)
      : 0;

  const processedClientsList = completedRecord
    ? completedRecord.clients_processed.split(' | ').map((c) => c.trim()).filter(Boolean)
    : statuses.map((s) => s.client_name);

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
                  ) : (() => {
                    const draftReady = derivedStatuses.filter((s) => s.step === 'draft_created').length;
                    const newClients = derivedStatuses.filter((s) => s.step === 'new_client_needs_harvest_copy').length;
                    const parts: string[] = [];
                    if (draftReady > 0) parts.push(`${draftReady} ready`);
                    if (newClients > 0) parts.push(`${newClients} not in QuickBooks (copy from Harvest)`);
                    return (
                      <>
                        <span>{parts.join(', ') || `${totalClients} done`}</span>
                        {completedRecord && completedRecord.total_amount > 0 && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="font-bold text-slate-700">
                              ${completedRecord.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </>
                        )}
                      </>
                    );
                  })()
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
            {(() => {
              const draftReady = derivedStatuses.filter((s) => s.step === 'draft_created').length;
              const newClients = derivedStatuses.filter((s) => s.step === 'new_client_needs_harvest_copy').length;
              const parts: string[] = [];
              if (draftReady > 0) parts.push(`${draftReady} ready`);
              if (newClients > 0) parts.push(`${newClients} not in QuickBooks (copy from Harvest)`);
              return (
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">
                      {parts.join(', ') || `${totalClients} done`}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {draftReady > 0
                        ? 'Drafts are ready — review details and click Send inside Gmail when ready.'
                        : 'Check QuickBooks and Gmail for items needing manual action.'}
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
              );
            })()}

            <div className="border-t border-slate-200 pt-3 space-y-2">
              {derivedStatuses.map((s) => (
                  <div key={s.client_name} className={`bg-white px-3 py-2.5 rounded-lg border text-xs ${s.step === 'new_client_needs_harvest_copy' ? 'border-yellow-200' : s.step === 'skipped' ? 'border-amber-200' : 'border-slate-100'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {s.step === 'new_client_needs_harvest_copy' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />
                        ) : s.step === 'skipped' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        )}
                        <span className="font-semibold text-slate-800">{s.client_name}</span>
                        <span className="text-slate-300">|</span>
                        <span className={s.step === 'new_client_needs_harvest_copy' ? 'text-yellow-700 font-medium' : s.step === 'skipped' ? 'text-amber-700 font-medium' : 'text-slate-500'}>
                          {stepLabel(s.step, '')}
                        </span>
                      </div>
                      {s.step === 'new_client_needs_harvest_copy' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 text-[10px] font-semibold flex-shrink-0">
                          Copy from Harvest
                        </span>
                      ) : s.step === 'skipped' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold flex-shrink-0">
                          Needs review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-semibold flex-shrink-0">
                          Pending review & send
                        </span>
                      )}
                    </div>
                    {s.step === 'new_client_needs_harvest_copy' && (
                      <p className="text-yellow-700 mt-1.5 pl-5">
                        This invoice hasn't been copied to QuickBooks yet. In Harvest, open the invoice and choose Actions → Copy to QuickBooks, then re-run this client.
                      </p>
                    )}
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
                        : s.step === 'skipped'
                          ? 'bg-amber-50/50 border-amber-200'
                          : s.step === 'new_client_needs_harvest_copy'
                            ? 'bg-yellow-50/50 border-yellow-200'
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
                            : s.step === 'skipped'
                              ? 'text-amber-600 font-medium'
                              : s.step === 'new_client_needs_harvest_copy'
                                ? 'text-yellow-700 font-medium'
                                : 'text-slate-500'
                    }`}>
                      {stepLabel(s.step, s.message)}
                    </p>
                    {s.error && (
                      <p className="text-xs text-red-600 mt-1 font-medium">{s.error}</p>
                    )}
                    {s.step === 'new_client_needs_harvest_copy' && (
                      <p className="text-xs text-yellow-700 mt-1">
                        This invoice hasn't been copied to QuickBooks yet. In Harvest, open the invoice and choose Actions → Copy to QuickBooks, then re-run this client.
                      </p>
                    )}
                  </div>
                  {s.step === 'draft_created' && (
                    <span className="badge-success text-[10px]">Done</span>
                  )}
                  {s.step === 'skipped' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-700 text-[10px] font-semibold">
                      Needs review
                    </span>
                  )}
                  {s.step === 'new_client_needs_harvest_copy' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-700 text-[10px] font-semibold">
                      Manual action
                    </span>
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

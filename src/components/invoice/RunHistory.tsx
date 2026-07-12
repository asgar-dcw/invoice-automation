import { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Calendar,
  User,
  Download,
  Search,
} from 'lucide-react';
import { fetchRunHistory } from '../../services/googleSheets';
import type { RunHistoryRecord } from '../../types/invoice';

function SkeletonRunCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="skeleton w-36 h-5" />
              <div className="skeleton w-20 h-5 rounded-full" />
            </div>
            <div className="flex items-center gap-3">
              <div className="skeleton w-24 h-3.5" />
              <div className="skeleton w-28 h-3.5" />
              <div className="skeleton w-32 h-3.5" />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <div className="skeleton w-12 h-4 rounded-full" />
              <div className="skeleton w-16 h-4 rounded-full" />
              <div className="skeleton w-14 h-4 rounded-full" />
            </div>
          </div>
        </div>
        <div className="text-right space-y-1 flex-shrink-0">
          <div className="skeleton w-20 h-6 ml-auto" />
          <div className="skeleton w-12 h-4 ml-auto" />
        </div>
      </div>
    </div>
  );
}

export default function RunHistory() {
  const [runs, setRuns] = useState<RunHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const lastClickRef = useRef<number>(0);

  // Filter and Search State
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory(force = false) {
    setLoading(true);
    setError('');
    try {
      const data = await fetchRunHistory(force);
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run history');
    } finally {
      setLoading(false);
    }
  }

  const handleRefreshClick = () => {
    const now = Date.now();
    if (now - lastClickRef.current < 2000) return;
    lastClickRef.current = now;
    loadHistory(true);
  };

  function StatusPill({ status }: { status: string }) {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return (
          <span className="badge-success">
            <CheckCircle2 className="w-3 h-3" />
            Drafts Created
          </span>
        );
      case 'failed':
      case 'error':
        return (
          <span className="badge-error">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="badge-warning">
            <Loader2 className="w-3 h-3 animate-spin" />
            Running
          </span>
        );
    }
  }

  // 1. Deduplicate by execution_id (stable keys for empty IDs).
  //    Skip legacy garbage rows where both execution_id and date are empty.
  const uniqueRunsMap = new Map<string, RunHistoryRecord>();
  let emptyIdCounter = 0;
  runs.forEach((run) => {
    const execId = run.execution_id.trim();
    if (!execId && !run.date.trim()) return; // legacy garbage row — skip
    if (execId && !uniqueRunsMap.has(execId)) {
      uniqueRunsMap.set(execId, run);
    } else if (!execId) {
      uniqueRunsMap.set(`empty-${emptyIdCounter++}`, run);
    }
  });
  const dedupedRuns = Array.from(uniqueRunsMap.values());

  // 2. Derive Months and Clients list for filter dropdowns
  const months = Array.from(new Set(dedupedRuns.map((r) => r.month).filter(Boolean))).sort().reverse();

  const clientsSet = new Set<string>();
  dedupedRuns.forEach((r) => {
    if (r.clients_processed) {
      r.clients_processed.split(' | ').forEach((c) => {
        const name = c.trim();
        if (name) clientsSet.add(name);
      });
    }
  });
  const clientNames = Array.from(clientsSet).sort();

  // 3. Filter Runs
  const filteredRuns = dedupedRuns.filter((run) => {
    if (selectedMonth && run.month !== selectedMonth) return false;

    if (selectedClient) {
      const clientList = run.clients_processed
        ? run.clients_processed.split(' | ').map((name) => name.trim().toLowerCase())
        : [];
      if (!clientList.includes(selectedClient.toLowerCase())) return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesExecId = run.execution_id.toLowerCase().includes(term);
      const matchesClient = run.clients_processed.toLowerCase().includes(term);
      if (!matchesExecId && !matchesClient) return false;
    }

    return true;
  });

  // 4. Group by Date Helper
  const getGroupHeader = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const isSameDay = (d1: Date, d2: Date) =>
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

      if (isSameDay(d, today)) return 'Today';
      if (isSameDay(d, yesterday)) return 'Yesterday';

      return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Other';
    }
  };

  const groupedRuns: Record<string, RunHistoryRecord[]> = {};
  filteredRuns.forEach((run) => {
    const header = getGroupHeader(run.date);
    if (!groupedRuns[header]) {
      groupedRuns[header] = [];
    }
    groupedRuns[header].push(run);
  });

  // 5. CSV Export Helper
  const exportToCSV = () => {
    const headers = [
      'Execution ID',
      'Date',
      'Month',
      'Triggered By',
      'Clients Processed',
      'Client Count',
      'Total Amount',
      'Status',
    ];

    const rows = filteredRuns.map((run) => [
      run.execution_id,
      run.date,
      run.month,
      run.triggered_by,
      `"${run.clients_processed.replace(/"/g, '""')}"`,
      run.client_count,
      run.total_amount,
      run.status,
    ]);

    const csvString = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `run_history_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="skeleton w-24 h-5" />
          <div className="skeleton w-16 h-5" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRunCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <p className="text-sm text-red-800 font-medium flex-1">{error}</p>
        <button
          type="button"
          onClick={() => loadHistory(true)}
          className="text-sm text-red-700 font-semibold hover:text-red-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search and Filters panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200">
        <div className="relative col-span-2 md:col-span-1">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Search ID or Client</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
            />
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Filter by Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">All Months</option>
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Filter by Client</label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full text-sm px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">All Clients</option>
            {clientNames.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={exportToCSV}
            disabled={filteredRuns.length === 0}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {filteredRuns.length} run{filteredRuns.length !== 1 ? 's' : ''} found
        </p>
        <button
          type="button"
          onClick={handleRefreshClick}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {filteredRuns.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-slate-50">
          <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No runs match your filters</p>
          <p className="text-xs text-slate-400 mt-1">Try resetting the dropdowns or adjusting search query</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedRuns).map(([groupHeader, groupRecords]) => (
            <div key={groupHeader} className="space-y-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 mt-4">
                {groupHeader}
              </div>
              <div className="space-y-3 stagger-children">
                {groupRecords.map((run) => {
                  const clientList = run.clients_processed
                    ? run.clients_processed.split(' | ').map((name) => name.trim()).filter(Boolean)
                    : [];
                  const isSchedule = run.triggered_by.trim().toLowerCase().includes('schedule');
                  const TriggerIcon = isSchedule ? Clock : User;

                  const formattedDate = (() => {
                    try {
                      const d = new Date(run.date);
                      const dateStr = d.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      });
                      const timeStr = d.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      });
                      return `${dateStr} at ${timeStr}`;
                    } catch {
                      return run.date;
                    }
                  })();

                  const isCompleted = run.status.toLowerCase() === 'completed' || run.status.toLowerCase() === 'success';
                  const isFailed = run.status.toLowerCase() === 'failed' || run.status.toLowerCase() === 'error';

                  return (
                    <div
                      key={run.execution_id}
                      className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 hover:shadow-md hover:border-slate-300 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-lg flex-shrink-0 ${
                            isCompleted
                              ? 'bg-emerald-50'
                              : isFailed
                                ? 'bg-red-50'
                                : 'bg-amber-50'
                          }`}>
                            {isCompleted ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : isFailed ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : (
                              <Clock className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-900 text-sm">
                                {formattedDate}
                              </p>
                              <StatusPill status={run.status} />
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <TriggerIcon className="w-3 h-3" />
                                {run.triggered_by}
                              </span>
                              <span className="text-xs text-slate-300">|</span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {run.execution_id.length > 12
                                  ? `${run.execution_id.slice(0, 12)}...`
                                  : run.execution_id}
                              </span>
                            </div>
                            {clientList.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {clientList.slice(0, 5).map((name) => (
                                  <span key={name} className="badge-neutral text-[10px]">
                                    {name}
                                  </span>
                                ))}
                                {clientList.length > 5 && (
                                  <span className="badge-neutral text-[10px]">
                                    +{clientList.length - 5} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex sm:block items-center gap-3 sm:text-right flex-shrink-0 pl-11 sm:pl-0">
                          <p className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                            ${run.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-slate-400 sm:mt-0.5">
                            {run.client_count} client{run.client_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

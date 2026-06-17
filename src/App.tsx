import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Receipt,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
  Zap,
  FileText,
  Settings,
  ChevronRight,
  Activity,
  Calendar,
} from 'lucide-react';

const MAX_TOASTS = 5;
import { fetchClients, clearSheetsCache, fetchEmailConfigs, fetchRunHistory } from './services/googleSheets';
import {
  triggerInvoiceAutomation,
} from './services/invoiceAutomation';
import StatsCards from './components/invoice/StatsCards';
import ClientTable from './components/invoice/ClientTable';
import RunSummaryBar from './components/invoice/RunSummaryBar';
import ConfirmModal from './components/invoice/ConfirmModal';
import RunStatusPanel from './components/invoice/RunStatusPanel';
import RunHistory from './components/invoice/RunHistory';
import { ToastContainer } from './components/invoice/Toast';
import InstallPWA from './components/invoice/InstallPWA';
import type {
  ClientRow,
  PaymentMethod,
  ClientProcessingStatus,
  WebhookPayload,
  Toast,
  RunHistoryRecord,
} from './types/invoice';

type Tab = 'dashboard' | 'history';

function getPreviousMonthLabel(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

let toastCounter = 0;
const TRIGGERED_BY = 'malay@dotcomweavers.com';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [runActive, setRunActive] = useState(false);
  const [statuses, setStatuses] = useState<ClientProcessingStatus[]>([]);
  const [allDone, setAllDone] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [lastRunText, setLastRunText] = useState<string>('');
  const [triggerTime, setTriggerTime] = useState<number>(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [historyKey, setHistoryKey] = useState(0);
  const [completedRecord, setCompletedRecord] = useState<RunHistoryRecord | null>(null);
  const [isTimeout, setIsTimeout] = useState(false);

  const initialLoadRef = useRef(false);
  const lastHistoryRefreshRef = useRef(0);
  const lastClientsRefreshRef = useRef(0);

  function addToast(type: Toast['type'], message: string) {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => {
      const next = [...prev, { id, type, message }];
      // Cap toasts so they don't accumulate endlessly
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const loadClients = useCallback(async (force = false) => {
    setLoading(true);
    setLoadError('');
    try {
      // Fetch configurations, emails, and run history in parallel
      const [rows, emailConfigs, history] = await Promise.all([
        fetchClients(force),
        fetchEmailConfigs(force),
        fetchRunHistory(force),
      ]);

      const now = new Date();

      // Map email config templates & duplicate run indicators
      const mapped = rows.map((client) => {
        const emailConfig = emailConfigs.find(
          (e) => e.company_name.trim().toLowerCase() === client.client_name.trim().toLowerCase()
        );

        // Check if there's a duplicate run for this client in the current calendar month
        const hasDuplicateWarning = history.some((run) => {
          if (!run.date) return false;
          const runDate = new Date(run.date);
          const isCurrentMonth =
            runDate.getFullYear() === now.getFullYear() &&
            runDate.getMonth() === now.getMonth();

          const isCompleted = run.status.toLowerCase() === 'completed' || run.status.toLowerCase() === 'success';
          const clientList = run.clients_processed
            ? run.clients_processed.split(' | ').map((c) => c.trim().toLowerCase())
            : [];

          return (
            isCurrentMonth &&
            isCompleted &&
            clientList.includes(client.client_name.trim().toLowerCase())
          );
        });

        return {
          ...client,
          emailConfig,
          hasDuplicateWarning,
        };
      });

      setClients(mapped);

      // Extract latest run timestamp from history
      if (history.length > 0) {
        const latestRun = history[0];
        try {
          const d = new Date(latestRun.date);
          const formatted = d.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).replace(',', ' at');
          setLastRunText(formatted);
        } catch {
          setLastRunText(latestRun.date);
        }
      }

      if (mapped.length > 0) {
        addToast('success', `Loaded ${mapped.length} clients`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load client data';
      setLoadError(msg);
      addToast('error', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      loadClients(false);
    }
  }, [loadClients]);

  const handleRefreshHistoryClick = () => {
    const now = Date.now();
    if (now - lastHistoryRefreshRef.current < 2000) return;
    lastHistoryRefreshRef.current = now;

    clearSheetsCache('runHistory');
    setHistoryKey((k) => k + 1);
  };

  const handleRefreshClientsClick = () => {
    const now = Date.now();
    if (now - lastClientsRefreshRef.current < 2000) return;
    lastClientsRefreshRef.current = now;
    loadClients(true);
  };

  function handleToggleSelect(index: number) {
    setClients((prev) =>
      prev.map((c, i) => (i === index ? { ...c, selected: !c.selected } : c))
    );
  }

  function handleToggleAll(selected: boolean) {
    setClients((prev) => prev.map((c) => ({ ...c, selected })));
  }

  function handlePaymentMethodChange(index: number, method: PaymentMethod) {
    setClients((prev) =>
      prev.map((c, i) => (i === index ? { ...c, payment_method: method } : c))
    );
  }

  async function handleConfirmRun() {
    const selected = clients.filter((c) => c.selected);
    const initialStatuses: ClientProcessingStatus[] = selected.map((c) => ({
      client_name: c.client_name,
      step: 'pending',
      message: 'Waiting in queue...',
    }));

    // Reset status panel states and close modal immediately
    setStatuses(initialStatuses);
    setShowConfirm(false);
    setRunActive(true);
    setAllDone(false);
    setCompletedRecord(null);
    setIsTimeout(false);
    setHasError(false);

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const payload: WebhookPayload = {
      trigger: 'manual',
      month,
      triggered_by: TRIGGERED_BY,
      clients: selected.map((c) => ({
        client_name: c.client_name,
        payment_method: c.payment_method,
        ar_email: c.ar_email,
        manual_attachment: c.manual_attachment === 'yes' ? 'yes' : 'no',
      })),
    };

    const currentTriggerTime = Date.now();
    setTriggerTime(currentTriggerTime);

    setTriggering(true);
    triggerInvoiceAutomation(payload)
      .then(({ executionId }) => {
        addToast('info', `Workflow triggered (Execution: ${executionId.slice(0, 8)}...)`);
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        setStatuses(
          selected.map((c) => ({
            client_name: c.client_name,
            step: 'error' as const,
            message: 'Failed to trigger workflow',
            error: errMsg,
          }))
        );
        setAllDone(true);
        setHasError(true);
        addToast('error', `Failed to trigger: ${errMsg}`);
      })
      .finally(() => {
        setTriggering(false);
      });
  }

  // Keyboard accessibility inside ConfirmModal
  const handleConfirmRunRef = useRef(handleConfirmRun);
  handleConfirmRunRef.current = handleConfirmRun;

  useEffect(() => {
    if (!showConfirm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowConfirm(false);
      } else if (e.key === 'Enter') {
        handleConfirmRunRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirm]);



  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: Activity },
    { id: 'history' as const, label: 'Run History', icon: Clock },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Header */}
      <header className="relative overflow-hidden">
        <div className="gradient-hero">
          {/* Decorative elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2" />
            <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-black/5 rounded-full blur-3xl translate-y-1/2" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-white/[0.02] rounded-full blur-3xl rotate-12" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="pt-8 pb-12 sm:pt-10 sm:pb-16">
              {/* Top bar */}
              <div className="flex items-center justify-between mb-8 sm:mb-12">
                <img
                  src="https://commercemarketplace.adobe.com/media/customer/MAG002771500/65c8c2363e6e2.png"
                  alt="DotcomWeavers"
                  className="h-10 sm:h-12 float-up drop-shadow-lg"
                />
                {lastRunText && (
                  <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white/90 text-sm font-medium">
                    <Zap className="w-3.5 h-3.5" />
                    Last run: {lastRunText}
                  </div>
                )}
              </div>

              {/* Title section */}
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white/90 text-xs font-semibold mb-4">
                  <Receipt className="w-3.5 h-3.5" />
                  INVOICE AUTOMATION
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-3 leading-tight">
                  Invoice Draft
                  <br />
                  <span className="text-white/80">Generator</span>
                </h1>
                <p className="text-white/70 text-base sm:text-lg max-w-lg leading-relaxed">
                  Automate monthly invoice processing — from Harvest to Gmail drafts, in one click.
                </p>

                {/* Quick info pills */}
                <div className="flex flex-wrap gap-2 mt-6">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 text-xs font-medium">
                    <Calendar className="w-3 h-3" />
                    {getPreviousMonthLabel()} invoices
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 text-xs font-medium">
                    <FileText className="w-3 h-3" />
                    {loading ? '...' : `${clients.length} clients configured`}
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 text-xs font-medium">
                    <Settings className="w-3 h-3" />
                    Harvest + n8n + Gmail
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" className="w-full h-auto">
            <path
              d="M0 60V30C240 0 480 0 720 30C960 60 1200 60 1440 30V60H0Z"
              fill="rgb(248 250 252)"
            />
          </svg>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-2 pb-32">
        {/* Stats */}
        <section className="mb-8">
          <StatsCards clients={clients} loading={loading} />
        </section>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-white rounded-xl border border-slate-200 p-1 w-full sm:w-auto sm:inline-flex shadow-sm">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center sm:justify-start gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                tab === id
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md shadow-orange-500/20'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'history' ? (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm slide-up">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Run History</h2>
                  <p className="text-sm text-slate-500">Past automation runs and their results</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRefreshHistoryClick}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 font-semibold text-sm rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh History
              </button>
            </div>
            <RunHistory key={historyKey} />
          </section>
        ) : (
          <div className="space-y-6">
            {/* Client Table Section */}
            <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm slide-up">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 shadow-lg shadow-orange-500/25">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Client Selection</h2>
                    <p className="text-sm text-slate-500">
                      Select clients and configure payment methods for this run
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshClientsClick}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 font-semibold text-sm rounded-xl hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Refresh Data
                </button>
              </div>

              {loadError && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-5 slide-down">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-800 font-medium flex-1">{loadError}</p>
                  <button
                    type="button"
                    onClick={handleRefreshClientsClick}
                    className="text-sm text-red-700 font-bold hover:text-red-800 transition-colors flex items-center gap-1"
                  >
                    Retry
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <ClientTable
                clients={clients}
                loading={loading}
                onToggleSelect={handleToggleSelect}
                onToggleAll={handleToggleAll}
                onPaymentMethodChange={handlePaymentMethodChange}
              />
            </section>

            {/* Run Status */}
            {runActive && (
              <section>
                <RunStatusPanel
                  statuses={statuses}
                  allDone={allDone}
                  hasError={hasError}
                  triggerTime={triggerTime}
                  triggeredBy={TRIGGERED_BY}
                  completedRecord={completedRecord}
                  isTimeout={isTimeout}
                  onViewHistory={() => setTab('history')}
                  onComplete={(record) => {
                    setAllDone(true);
                    setCompletedRecord(record);
                    loadClients(true);
                  }}
                  onTimeout={() => {
                    setIsTimeout(true);
                  }}
                />
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-xs text-slate-400 font-medium">
            Powered by DotcomWeavers
            <span className="mx-1.5 text-slate-300">|</span>
            Harvest + n8n + Gmail Automation
          </p>
        </footer>
      </main>

      {/* Sticky Bottom Bar — only on Dashboard tab when not running */}
      {tab === 'dashboard' && !runActive && (
        <RunSummaryBar clients={clients} onRun={() => setShowConfirm(true)} />
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <ConfirmModal
          clients={clients}
          onConfirm={handleConfirmRun}
          onCancel={() => setShowConfirm(false)}
          loading={triggering}
        />
      )}

      {/* PWA Install Prompt */}
      <InstallPWA />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

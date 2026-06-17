import { X, AlertTriangle, Rocket, Loader2, Shield, Mail, CreditCard } from 'lucide-react';
import type { ClientRow } from '../../types/invoice';

interface ConfirmModalProps {
  clients: ClientRow[];
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export default function ConfirmModal({
  clients,
  onConfirm,
  onCancel,
  loading,
}: ConfirmModalProps) {
  const selected = clients.filter((c) => c.selected);
  const hasAttachmentWarning = selected.some((c) => c.manual_attachment === 'yes');

  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function getPaymentLabel(opt: 'bank' | 'credit_card' | 'both'): string {
    switch (opt) {
      case 'bank': return 'Bank';
      case 'credit_card': return 'Credit Card';
      case 'both': return 'Both';
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm fade-in"
        onClick={loading ? undefined : onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] sm:max-h-[85vh] flex flex-col scale-in overflow-hidden mx-2 sm:mx-0">
        {/* Header */}
        <div className="relative px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 shadow-lg shadow-orange-500/25">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Confirm Invoice Run</h3>
                <p className="text-sm text-slate-500">{monthLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 space-y-4 custom-scrollbar">
          {hasAttachmentWarning && (
            <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl slide-down">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium leading-relaxed">
                Some clients require manual attachment. Add attachments to their Gmail drafts before sending.
              </p>
            </div>
          )}

          {/* Client list */}
          <div className="space-y-2">
            {selected.map((client, idx) => (
              <div
                key={client.client_name}
                className="flex items-center gap-4 p-3.5 bg-slate-50 rounded-xl hover:bg-slate-100/80 transition-colors"
                style={{ animationDelay: `${idx * 0.03}s` }}
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {client.client_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 text-sm truncate">
                      {client.client_name}
                    </p>
                    {client.manual_attachment === 'yes' && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      {client.payment_method === 'credit_card' ? (
                        <CreditCard className="w-3 h-3" />
                      ) : (
                        <Shield className="w-3 h-3" />
                      )}
                      {getPaymentLabel(client.payment_method)}
                    </span>
                    <span className="text-xs text-slate-300">|</span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Mail className="w-3 h-3" />
                      {client.ar_email}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-700">
              Total to Process
            </span>
            <span className="text-sm font-bold text-slate-950">
              {selected.length} client{selected.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex-[2] py-2.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/25 transition-all text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Triggering Workflow...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Confirm &amp; Run
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

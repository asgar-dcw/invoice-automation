import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
} from 'lucide-react';
import type { ClientRow, PaymentMethod } from '../../types/invoice';

interface ClientTableProps {
  clients: ClientRow[];
  loading: boolean;
  onToggleSelect: (index: number) => void;
  onToggleAll: (selected: boolean) => void;
  onPaymentMethodChange: (index: number, method: PaymentMethod) => void;
}

const PAYMENT_OPTIONS: PaymentMethod[] = ['bank', 'credit_card', 'both'];

type SortField = 'client_name' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'ready' | 'needs_attachment' | 'duplicate';

function StatusBadge({ manualAttachment }: { manualAttachment: string }) {
  if (manualAttachment === 'yes') {
    return (
      <span className="badge-warning">
        <AlertTriangle className="w-3 h-3" />
        Needs attachment
      </span>
    );
  }
  return (
    <span className="badge-success">
      <CheckCircle2 className="w-3 h-3" />
      Ready
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-4 px-4"><div className="skeleton w-4 h-4 rounded" /></td>
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="skeleton w-36 h-4" />
            <div className="skeleton w-24 h-3" />
          </div>
        </div>
      </td>
      <td className="py-4 px-4"><div className="skeleton w-28 h-8 rounded-lg" /></td>
      <td className="py-4 px-4"><div className="skeleton w-24 h-6 rounded-full" /></td>
    </tr>
  );
}

export default function ClientTable({
  clients,
  loading,
  onToggleSelect,
  onToggleAll,
  onPaymentMethodChange,
}: ClientTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('client_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  const filteredAndSorted = useMemo(() => {
    let result = clients.map((c, i) => ({ ...c, _origIdx: i }));

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.client_name.toLowerCase().includes(q));
    }

    if (statusFilter !== 'all') {
      result = result.filter((c) => {
        if (statusFilter === 'needs_attachment') return c.manual_attachment === 'yes';
        if (statusFilter === 'ready') return c.manual_attachment !== 'yes';
        if (statusFilter === 'duplicate') return !!c.hasDuplicateWarning;
        return true;
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'client_name':
          cmp = a.client_name.localeCompare(b.client_name);
          break;
        case 'status': {
          const aStatus = a.manual_attachment === 'yes' ? 1 : 0;
          const bStatus = b.manual_attachment === 'yes' ? 1 : 0;
          cmp = aStatus - bStatus;
          break;
        }
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [clients, search, sortField, sortDir, statusFilter]);

  const allSelected = clients.length > 0 && clients.every((c) => c.selected);
  const someSelected = clients.some((c) => c.selected);
  const selectedCount = clients.filter((c) => c.selected).length;

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function toggleExpand(clientName: string) {
    setExpandedClients((prev) => ({
      ...prev,
      [clientName]: !prev[clientName],
    }));
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-orange-500" />
      : <ArrowDown className="w-3.5 h-3.5 text-orange-500" />;
  }

  function getPaymentLabel(opt: PaymentMethod): string {
    switch (opt) {
      case 'bank': return 'Bank';
      case 'credit_card': return 'Credit Card';
      case 'both': return 'Both';
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium placeholder:text-slate-400 input-focus"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium input-focus cursor-pointer appearance-none"
            >
              <option value="all">All statuses</option>
              <option value="ready">Ready</option>
              <option value="needs_attachment">Needs attachment</option>
              <option value="duplicate">Already run this month</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => onToggleAll(!allSelected)}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:border-orange-300 hover:text-orange-600 transition-all whitespace-nowrap"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      {/* Selection info bar */}
      {someSelected && !loading && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl slide-down">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-sm font-semibold text-orange-800">
            {selectedCount} of {clients.length} client{clients.length !== 1 ? 's' : ''} selected
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[56vh] custom-scrollbar">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3.5 px-4 w-12" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={() => onToggleAll(!allSelected)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400/30 cursor-pointer"
                  />
                </th>
                <th className="text-left py-3.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('client_name')}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors"
                  >
                    Client Name
                    <SortIcon field="client_name" />
                  </button>
                </th>
                <th className="text-left py-3.5 px-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Payment
                  </span>
                </th>
                <th className="text-left py-3.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('status')}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors"
                  >
                    Status
                    <SortIcon field="status" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 rounded-full bg-slate-100">
                        <Search className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="font-semibold text-slate-600">No clients found</p>
                      <p className="text-sm text-slate-400">
                        {search || statusFilter !== 'all'
                          ? 'Try adjusting your search or filters'
                          : 'Check your Google Sheets configuration'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map((client) => (
                  <tr
                    key={client.client_name}
                    onClick={() => onToggleSelect(client._origIdx)}
                    className={`border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer ${
                      client.selected
                        ? 'bg-blue-50/40 hover:bg-blue-50/60'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={client.selected}
                        onChange={() => onToggleSelect(client._origIdx)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400/30 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${
                          client.manual_attachment === 'yes'
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                            : 'bg-gradient-to-br from-emerald-400 to-green-600'
                        }`}>
                          {client.client_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 text-sm truncate">{client.client_name}</p>
                            {client.hasDuplicateWarning && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
                                Already run this month
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <span className="truncate">{client.ar_email}</span>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(client.client_name);
                              }}
                              className="text-orange-500 hover:text-orange-600 font-semibold transition-colors flex-shrink-0"
                            >
                              {expandedClients[client.client_name] ? 'Hide Preview' : 'Email Preview'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expandable Email Preview Details */}
                      {expandedClients[client.client_name] && (
                        <div className="mt-2.5 space-y-1.5 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200/60 shadow-inner slide-down" onClick={(e) => e.stopPropagation()}>
                          <div className="border-b border-slate-200 pb-1.5 mb-1.5 flex items-center justify-between">
                            <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider">Email Template Preview</span>
                            <span className="text-[10px] text-slate-400">Billed: {client.payment_method === 'bank' ? 'Bank' : client.payment_method === 'credit_card' ? 'Credit Card' : 'Both'}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <p className="truncate"><span className="font-bold text-slate-500">To:</span> <span className="font-mono text-slate-700">{client.emailConfig?.to || '—'}</span></p>
                            <p className="truncate"><span className="font-bold text-slate-500">Cc:</span> <span className="font-mono text-slate-700">{client.emailConfig?.cc || '—'}</span></p>
                            <p className="truncate"><span className="font-bold text-slate-500">Bcc:</span> <span className="font-mono text-slate-700">{client.emailConfig?.bcc || '—'}</span></p>
                          </div>
                          <p className="pt-1 border-t border-slate-100 mt-1.5"><span className="font-bold text-slate-500">Subject:</span> <span className="font-medium text-slate-800">{client.emailConfig?.subject || '—'}</span></p>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={client.payment_method}
                        onChange={(e) =>
                          onPaymentMethodChange(client._origIdx, e.target.value as PaymentMethod)
                        }
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium input-focus cursor-pointer"
                      >
                        {PAYMENT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{getPaymentLabel(opt)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge manualAttachment={client.manual_attachment} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

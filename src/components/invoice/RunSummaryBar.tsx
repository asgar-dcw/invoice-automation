import { Play, Users, AlertTriangle } from 'lucide-react';
import type { ClientRow } from '../../types/invoice';

interface RunSummaryBarProps {
  clients: ClientRow[];
  onRun: () => void;
}

export default function RunSummaryBar({ clients, onRun }: RunSummaryBarProps) {
  const selected = clients.filter((c) => c.selected);
  const attachmentCount = selected.filter((c) => c.manual_attachment === 'yes').length;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="bg-white/90 backdrop-blur-xl border-t border-slate-200 shadow-[0_-8px_32px_rgba(0,0,0,0.08)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-5 flex-wrap min-w-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-slate-700 whitespace-nowrap">
                  {selected.length} client{selected.length !== 1 ? 's' : ''} selected
                </span>
              </div>

              {attachmentCount > 0 && (
                <>
                  <div className="w-px h-5 bg-slate-200 hidden sm:block" />
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-50">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    </div>
                    <span className="text-xs font-semibold text-amber-700">
                      {attachmentCount} need{attachmentCount !== 1 ? '' : 's'} attachment
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onRun}
              disabled={selected.length === 0}
              className="group relative inline-flex items-center gap-2 px-4 py-2.5 sm:px-7 sm:py-3 font-bold text-xs sm:text-sm rounded-xl transition-all duration-300 disabled:cursor-not-allowed overflow-hidden flex-shrink-0
                bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/25
                hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5
                active:translate-y-0 active:shadow-md
                disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 disabled:shadow-none disabled:translate-y-0"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden" />
              <Play className="w-4 h-4 relative z-10" />
              <span className="relative z-10 hidden sm:inline">Run Invoice Automation</span>
              <span className="relative z-10 sm:hidden">Run</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  if (isInstalled || dismissed || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-24 z-50 slide-up">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 sm:p-5 max-w-sm mx-auto sm:mx-0 sm:ml-auto">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 shadow-lg shadow-orange-500/25 flex-shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-slate-900 text-sm">Install App</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Add Invoice Automation to your desktop for quick access.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-xs rounded-lg hover:opacity-90 shadow-md shadow-orange-500/15 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Install
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-all flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

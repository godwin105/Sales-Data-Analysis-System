import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

const DISMISS_KEY = 'pwa_dismissed_until';
const DISMISS_DAYS = 7;

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible]               = useState(false);
  const [installed, setInstalled]           = useState(false);

  useEffect(() => {
    // Already running as installed PWA — don't show banner
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    // User dismissed recently — respect it
    const until = localStorage.getItem(DISMISS_KEY);
    if (until && Date.now() < Number(until)) return;

    const handler = (e) => {
      e.preventDefault();           // stop Chrome's mini-infobar
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
    setVisible(false);
  }

  function handleDismiss() {
    setVisible(false);
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, until.toString());
  }

  if (installed || !visible) return null;

  return (
    <div className="fixed bottom-4 left-3 right-3 z-50 sm:left-auto sm:right-4 sm:w-80 animate-slide-up">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-4">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 pr-5">
          <div className="flex-shrink-0 w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center">
            <Smartphone className="text-white" size={22} />
          </div>
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">
              Install Biashara App
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 leading-snug">
              Add to your home screen for quick access. Works offline too.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleInstall}
            className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-2"
          >
            <Download size={14} />
            Install App
          </button>
          <button
            onClick={handleDismiss}
            className="btn-secondary px-4 py-2 text-sm"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

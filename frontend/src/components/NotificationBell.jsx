import { useState, useRef, useEffect } from 'react';
import { Bell, Package, TrendingDown, TrendingUp, ShoppingCart, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../context/NotificationContext';
import { formatQuantity } from '../utils/format';

const TYPE_ICON = {
  low_stock:    <TrendingDown size={14} className="text-amber-500" />,
  out_of_stock: <Package size={14} className="text-red-500" />,
  high_expense: <TrendingDown size={14} className="text-red-500" />,
  cashier_sale: <ShoppingCart size={14} className="text-brand-500" />,
  insight:      <TrendingUp size={14} className="text-emerald-500" />,
};

function timeAgo(isoString) {
  const hasOffset = isoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoString);
  const value = hasOffset ? isoString : `${isoString}+03:00`;
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function parseParams(bodyStr) {
  try {
    const p = JSON.parse(bodyStr);
    // Must be a plain object — rejects old-format English body strings
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
  } catch { return null; }
}

function formatAmount(n) {
  return Number(n).toLocaleString();
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markRead, markAllRead, fetchNotifications } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Fetch fresh data every time the bell is opened so the list is always current
  function handleToggle() {
    setOpen((v) => {
      if (!v) fetchNotifications();
      return !v;
    });
  }

  function handleNotificationClick(n) {
    if (!n.is_read) markRead(n.notification_id);
  }

  function getTitle(n) {
    const params = parseParams(n.body);
    // Old-format: body is a plain English sentence, not JSON → show raw title as-is
    if (params === null) return n.title;
    return t(`notifications.titleText.${n.type}`, { name: n.title, defaultValue: n.title });
  }

  function getBody(n) {
    const params = parseParams(n.body);
    // Old-format: body is a plain English sentence, not JSON → show it as-is
    if (params === null) return n.body || '';
    if (params.amount !== undefined) params.amount = formatAmount(params.amount);
    if (params.qty !== undefined) params.qty = formatQuantity(params.qty);
    if (params.threshold !== undefined) params.threshold = formatQuantity(params.threshold);
    if (params.unit === undefined) params.unit = '';
    return t(`notifications.bodyText.${n.type}`, {
      name: n.title,
      defaultValue: n.body || '',
      ...params,
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        aria-label={t('notifications.title')}
        title={t('notifications.title')}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-0.5">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-3 right-3 top-16 max-h-[calc(100vh-5rem)] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-h-none">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="min-w-0 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {t('notifications.title')}
              {unreadCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </span>
            <div className="flex flex-shrink-0 items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap"
                >
                  {t('notifications.markAllRead')}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[calc(100vh-9rem)] sm:max-h-96">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Bell size={32} className="text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {t('notifications.empty')}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {t('notifications.emptyMessage')}
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.notification_id}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                    !n.is_read ? 'bg-brand-50/50 dark:bg-brand-600/10' : ''
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {TYPE_ICON[n.type] ?? <Bell size={14} className="text-slate-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs leading-snug break-words ${n.is_read ? 'text-slate-600 dark:text-slate-300' : 'text-slate-800 dark:text-slate-100 font-semibold'}`}>
                        {getTitle(n)}
                      </p>
                      {!n.is_read && (
                        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-500 mt-1" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug break-words">
                        {getBody(n)}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

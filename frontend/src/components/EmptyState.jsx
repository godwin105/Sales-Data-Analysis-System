
export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="text-center py-12 px-4">
      {Icon && (
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 mb-4">
          <Icon className="text-slate-400 dark:text-slate-500" size={26} />
        </div>
      )}
      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h3>
      {message && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
          {message}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

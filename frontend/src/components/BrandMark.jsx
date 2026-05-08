import { BarChart3 } from 'lucide-react';

/**
 * Brand mark used in the auth pages and sidebar.
 */
export default function BrandMark({ size = 'md', tagline = true }) {
  const sizes = {
    sm: { logoBox: 'w-8 h-8', icon: 16, title: 'text-base', subtitle: 'text-[10px]' },
    md: { logoBox: 'w-12 h-12', icon: 24, title: 'text-xl', subtitle: 'text-xs' },
    lg: { logoBox: 'w-14 h-14', icon: 28, title: 'text-2xl', subtitle: 'text-sm' },
  };
  const s = sizes[size] || sizes.md;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`${s.logoBox} rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white shadow-md`}>
        <BarChart3 size={s.icon} strokeWidth={2.5} />
      </div>
      <div className="text-center">
        <div className={`${s.title} font-bold text-slate-800 dark:text-slate-100`}>
          Sales Data Analysis System
        </div>
        {tagline && (
          <div className={`${s.subtitle} text-slate-500 dark:text-slate-400 mt-0.5`}>
            For small businesses in Tanzania
          </div>
        )}
      </div>
    </div>
  );
}

import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const rules = [
  { key: 'minLength',   test: (v) => v.length >= 8 },
  { key: 'uppercase',   test: (v) => /[A-Z]/.test(v) },
  { key: 'lowercase',   test: (v) => /[a-z]/.test(v) },
  { key: 'number',      test: (v) => /[0-9]/.test(v) },
  { key: 'special',     test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function PasswordStrengthHint({ value = '' }) {
  const { t } = useTranslation();
  if (!value) return null;

  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
      {rules.map(({ key, test }) => {
        const ok = test(value);
        return (
          <li key={key} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>
            {ok
              ? <Check size={12} className="flex-shrink-0" />
              : <X size={12} className="flex-shrink-0" />
            }
            {t(`passwordStrength.${key}`)}
          </li>
        );
      })}
    </ul>
  );
}

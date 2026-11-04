import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Passer au mode clair' : 'Passer au mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-[color,border-color,transform] duration-300 hover:border-brand hover:text-ink hover:rotate-12"
    >
      <span key={theme} className="icon-pop-in flex">
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
      </span>
    </button>
  );
}

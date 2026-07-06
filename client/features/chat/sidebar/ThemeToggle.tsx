'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // next-themes only knows the real theme after mount (it reads
  // localStorage/system preference client-side) — render a neutral
  // placeholder first to avoid a hydration mismatch/flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button size="icon" variant="ghost" disabled />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

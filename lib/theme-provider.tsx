'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);
  const supabase = createClient();

  // Load theme from localStorage and Supabase on mount
  useEffect(() => {
    setMounted(true);
    
    const loadTheme = async () => {
      // First check localStorage
      const stored = localStorage.getItem('theme') as Theme;
      if (stored && ['dark', 'light', 'system'].includes(stored)) {
        setThemeState(stored);
      }

      // Then try to sync with Supabase
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_settings')
            .select('dark_mode')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (data) {
            const dbTheme = data.dark_mode ? 'dark' : 'light';
            setThemeState(dbTheme);
          }
        }
      } catch (error) {
        console.error('Error loading theme from DB:', error);
      }
    };

    loadTheme();
  }, []);

  // Apply theme changes
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const newResolvedTheme = theme === 'system' ? systemTheme : theme;

    setResolvedTheme(newResolvedTheme);
    localStorage.setItem('theme', theme);

    if (newResolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme, mounted]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    
    // Sync with Supabase
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('user_settings')
          .upsert({
            user_id: user.id,
            dark_mode: newTheme === 'dark' || (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
          }, {
            onConflict: 'user_id'
          });
      }
    } catch (error) {
      console.error('Error saving theme to DB:', error);
    }
  };

  // Prevent flash of wrong theme
  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

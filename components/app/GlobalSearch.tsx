'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Loader2 } from 'lucide-react';

interface SearchResult {
  type: 'player';
  id: string;
  name: string;
  subtitle: string;
  avatar_url?: string | null;
  href: string;
}

interface GlobalSearchProps {
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  onNavigate?: () => void; // called after navigating (e.g. to close mobile search)
}

export function GlobalSearch({ className = '', inputClassName = '', placeholder = 'Search players, tournaments...', onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const searchTerm = `%${q.trim()}%`;

      const playersRes = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .or(`username.ilike.${searchTerm},display_name.ilike.${searchTerm}`)
        .order('username', { ascending: true })
        .limit(8);

      const searchResults: SearchResult[] = [];

      // Map players
      if (playersRes.data) {
        for (const p of playersRes.data) {
          searchResults.push({
            type: 'player',
            id: p.user_id,
            name: p.display_name || p.username || 'Unknown',
            subtitle: p.username ? `@${p.username}` : '',
            avatar_url: p.avatar_url,
            href: `/app/profile/${p.user_id}`,
          });
        }
      }

      setResults(searchResults);
      setOpen(true);
      setSelectedIndex(-1);
    } catch (err) {
      console.error('[Search] Error:', err);
      setResults([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    router.push(result.href);
    onNavigate?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (!open || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
        <Input
          ref={inputRef}
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          className={`pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-400 focus:border-emerald-500/50 focus:ring-emerald-500/20 ${inputClassName}`}
        />
      </div>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-[100]">
          {results.map((result, i) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === selectedIndex ? 'bg-emerald-500/10' : 'hover:bg-white/5'
              }`}
            >
              <Avatar className="w-8 h-8">
                <AvatarImage src={result.avatar_url || ''} />
                <AvatarFallback className="bg-slate-700 text-white text-xs">
                  {result.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{result.name}</p>
                <p className="text-xs text-slate-400 truncate">{result.subtitle}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Player
              </span>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {open && results.length === 0 && query.trim().length >= 2 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl p-4 z-[100]">
          <p className="text-sm text-slate-400 text-center">No results found</p>
        </div>
      )}
    </div>
  );
}

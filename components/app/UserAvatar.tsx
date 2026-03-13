'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';

// Cache avatar URLs to avoid re-fetching
const avatarCache = new Map<string, string | null>();

interface UserAvatarProps {
  userId?: string | null;
  name?: string;
  className?: string;
  fallbackClassName?: string;
}

export function UserAvatar({ userId, name, className = 'w-10 h-10', fallbackClassName = 'bg-gradient-to-br from-slate-700 to-slate-800 text-white font-bold' }: UserAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Check cache first
    if (avatarCache.has(userId)) {
      setAvatarUrl(avatarCache.get(userId) || null);
      return;
    }

    const supabase = createClient();
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const url = data?.avatar_url || null;
        avatarCache.set(userId, url);
        setAvatarUrl(url);
      });
  }, [userId]);

  const initial = name ? name[0].toUpperCase() : 'U';

  return (
    <Avatar className={className}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name || ''} />}
      <AvatarFallback className={fallbackClassName}>
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

'use client';

import { useEffect, useRef } from 'react';

export function useClickSfx() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayTimeRef = useRef<number>(0);
  const isEnabledRef = useRef(false);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://azrmgtukcgqslnilodky.supabase.co';
    const audio = new Audio(`${supabaseUrl}/storage/v1/object/public/public-assets/Click.mp3`);
    audio.volume = 0.2;
    audio.preload = 'auto';
    audioRef.current = audio;

    const handleClick = (e: MouseEvent) => {
      if (!audioRef.current || !isEnabledRef.current) {
        isEnabledRef.current = true;
        return;
      }

      const target = e.target as HTMLElement;
      if (!target) return;

      const clickableElement = target.closest('button, [role="button"], a');

      if (!clickableElement) return;

      if (clickableElement.hasAttribute('data-no-click-sfx')) return;

      if (
        clickableElement.hasAttribute('disabled') ||
        clickableElement.getAttribute('aria-disabled') === 'true'
      ) {
        return;
      }

      const isInput = target.closest('input, textarea, select, [contenteditable="true"]');
      if (isInput) return;

      const now = Date.now();
      if (now - lastPlayTimeRef.current < 50) return;
      lastPlayTimeRef.current = now;

      try {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      } catch (error) {}
    };

    document.addEventListener('click', handleClick, { capture: true });

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
}

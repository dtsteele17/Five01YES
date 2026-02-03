'use client';

import { useClickSfx } from '@/lib/hooks/useClickSfx';

export function ClickSfxProvider({ children }: { children: React.ReactNode }) {
  useClickSfx();
  return <>{children}</>;
}

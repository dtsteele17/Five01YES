'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function QuickMatchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get('roomId');

  useEffect(() => {
    if (roomId) {
      // Redirect to the dynamic route with path param
      router.replace(`/app/play/quick-match/match/${roomId}`);
    } else {
      // No room ID provided, go back to lobby
      router.replace('/app/play/quick-match');
    }
  }, [roomId, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
    </div>
  );
}

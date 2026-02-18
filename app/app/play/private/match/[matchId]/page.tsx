'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function PrivateMatchGamePage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params?.matchId as string;

  useEffect(() => {
    if (matchId) {
      router.replace(`/app/play/quick-match/match/${matchId}`);
    }
  }, [matchId, router]);

  return null;
}

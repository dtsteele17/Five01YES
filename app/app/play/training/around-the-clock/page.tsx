'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TrainingAroundTheClockPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/app/play/training/around-the-clock/solo');
  }, [router]);

  return <div className="text-white">Redirecting...</div>;
}

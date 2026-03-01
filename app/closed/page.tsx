'use client';

import { useEffect, useState } from 'react';
import { Lock, Clock } from 'lucide-react';

export default function ClosedPage() {
  const [londonTime, setLondonTime] = useState('');

  useEffect(() => {
    const update = () => {
      setLondonTime(
        new Date().toLocaleTimeString('en-GB', {
          timeZone: 'Europe/London',
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-white tracking-tight">
            <span className="text-emerald-400">FIVE</span>01
          </h1>
        </div>

        {/* Lock Icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-slate-800/50 border border-slate-700/50 flex items-center justify-center">
          <Lock className="w-12 h-12 text-slate-400" />
        </div>

        {/* Message */}
        <h2 className="text-2xl font-bold text-white mb-3">Testing Window Closed</h2>
        <p className="text-slate-400 text-lg mb-6">
          The beta is only available during testing hours.
        </p>

        {/* Time Info */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400 font-bold text-lg">Testing Hours</span>
          </div>
          <p className="text-3xl font-black text-white mb-2">6:00 PM — 9:30 PM</p>
          <p className="text-slate-400 text-sm">UK Time (Europe/London)</p>
          {londonTime && (
            <p className="text-slate-500 text-sm mt-3">
              Current UK time: <span className="text-white font-bold">{londonTime}</span>
            </p>
          )}
        </div>

        <p className="text-slate-500 text-sm">
          Come back during the testing window to play! 🎯
        </p>
      </div>
    </div>
  );
}

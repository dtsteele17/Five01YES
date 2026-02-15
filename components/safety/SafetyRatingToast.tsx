'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SafetyGrade, GRADE_COLORS, GRADE_TEXT_COLORS, GRADE_LABELS } from '@/lib/safety/safetyService';
import { Star, X, Shield } from 'lucide-react';

interface SafetyRatingToastProps {
  grade: SafetyGrade;
  raterName?: string;
  onClose: () => void;
  duration?: number; // Duration in milliseconds, default 2000ms
}

export function SafetyRatingToast({ 
  grade, 
  raterName, 
  onClose,
  duration = 2000 
}: SafetyRatingToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100]"
    >
      <div className={`
        ${GRADE_COLORS[grade]}
        rounded-xl px-6 py-4 shadow-2xl border-2 border-white/20
        flex items-center gap-4 min-w-[280px]
      `}>
        <div className="relative">
          <div className={`
            w-14 h-14 rounded-full bg-white/20 flex items-center justify-center
            backdrop-blur-sm
          `}>
            <span className="text-2xl font-black">{grade}</span>
          </div>
          <div className="absolute -top-1 -right-1">
            <Star className="w-5 h-5 fill-yellow-300 text-yellow-300" />
          </div>
        </div>

        <div className="flex-1">
          <h4 className="font-bold text-lg">New Rating Received!</h4>
          <p className="text-sm opacity-90">
            {raterName ? `${raterName} rated you` : 'Someone rated you'}
          </p>
          <p className={`text-xs font-medium mt-0.5 ${
            grade === 'A' || grade === 'B' ? 'text-white/80' : 'text-slate-700'
          }`}>
            {GRADE_LABELS[grade]}
          </p>
        </div>

        <button 
          onClick={onClose}
          className={`
            p-1.5 rounded-full transition-colors
            ${grade === 'A' || grade === 'B' 
              ? 'hover:bg-white/20 text-white' 
              : 'hover:bg-black/10 text-slate-800'
            }
          `}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Toast container that manages multiple rating notifications
 */
interface RatingNotification {
  id: string;
  grade: SafetyGrade;
  raterName?: string;
}

export function SafetyRatingToastContainer() {
  const [notifications, setNotifications] = useState<RatingNotification[]>([]);

  const addNotification = (grade: SafetyGrade, raterName?: string) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, grade, raterName }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return {
    notifications,
    addNotification,
    render: () => (
      <AnimatePresence>
        {notifications.map((notification, index) => (
          <div 
            key={notification.id}
            style={{ 
              position: 'fixed',
              top: `${20 + index * 100}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100 + index
            }}
          >
            <SafetyRatingToast
              grade={notification.grade}
              raterName={notification.raterName}
              onClose={() => removeNotification(notification.id)}
              duration={2000}
            />
          </div>
        ))}
      </AnimatePresence>
    )
  };
}

/**
 * Simple inline notification for embedding in other components
 */
export function SafetyRatingInline({ 
  grade, 
  raterName 
}: { 
  grade: SafetyGrade; 
  raterName?: string 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`
        ${GRADE_COLORS[grade]}
        rounded-lg px-4 py-3 flex items-center gap-3
        shadow-lg border border-white/20
      `}
    >
      <div className={`
        w-10 h-10 rounded-full bg-white/20 flex items-center justify-center
        backdrop-blur-sm
      `}>
        <Shield className="w-5 h-5" />
      </div>
      <div>
        <p className="font-bold text-sm">
          You received a {grade} rating!
        </p>
        <p className="text-xs opacity-80">
          {raterName ? `from ${raterName}` : 'from your opponent'}
        </p>
      </div>
    </motion.div>
  );
}

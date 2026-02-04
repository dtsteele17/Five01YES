'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Edit, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Visit {
  visitNumber: number;
  score: number;
  remaining: number;
  isBust: boolean;
  isCheckout: boolean;
}

interface QuickMatchVisitHistoryPanelProps {
  myVisits: Visit[];
  opponentVisits: Visit[];
  myName: string;
  opponentName: string;
  myColor: string;
  opponentColor: string;
  onEditVisit?: (visitNumber: number, newScore: number) => void;
}

export function QuickMatchVisitHistoryPanel({
  myVisits,
  opponentVisits,
  myName,
  opponentName,
  myColor,
  opponentColor,
  onEditVisit,
}: QuickMatchVisitHistoryPanelProps) {
  const [showAllModal, setShowAllModal] = useState(false);
  const maxVisibleVisits = 8;

  const renderVisitRow = (visit: Visit, playerName: string, color: string, editable: boolean) => (
    <div
      key={`${playerName}-${visit.visitNumber}`}
      className="flex items-center justify-between py-2 px-3 rounded hover:bg-slate-800/30"
    >
      <div className="flex items-center space-x-3">
        <span className="text-xs text-gray-500 w-8">#{visit.visitNumber}</span>
        <span className={`text-lg font-bold ${color}`}>
          {visit.score}
        </span>
        {visit.isBust && (
          <span className="text-xs text-red-400 font-semibold">BUST</span>
        )}
        {visit.isCheckout && (
          <span className="text-xs text-amber-400 font-semibold">CHECKOUT!</span>
        )}
      </div>
      <div className="flex items-center space-x-3">
        <span className="text-sm text-gray-400">{visit.remaining}</span>
        {editable && onEditVisit && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEditVisit(visit.visitNumber, visit.score)}
            className="h-7 w-7 p-0 hover:bg-white/5"
          >
            <Edit className="w-3 h-3 text-gray-400" />
          </Button>
        )}
      </div>
    </div>
  );

  const recentMyVisits = myVisits.slice(-maxVisibleVisits);
  const recentOpponentVisits = opponentVisits.slice(-maxVisibleVisits);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-semibold ${myColor}`}>{myName} (You)</h3>
            <span className="text-xs text-gray-500">{myVisits.length} visits</span>
          </div>
          <div className="space-y-1">
            {recentMyVisits.map((visit) => renderVisitRow(visit, myName, myColor, true))}
            {myVisits.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No visits yet</p>
            )}
          </div>
        </div>

        <Separator className="bg-white/5" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-semibold ${opponentColor}`}>{opponentName}</h3>
            <span className="text-xs text-gray-500">{opponentVisits.length} visits</span>
          </div>
          <div className="space-y-1">
            {recentOpponentVisits.map((visit) => renderVisitRow(visit, opponentName, opponentColor, false))}
            {opponentVisits.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No visits yet</p>
            )}
          </div>
        </div>
      </div>

      {(myVisits.length > maxVisibleVisits || opponentVisits.length > maxVisibleVisits) && (
        <Button
          onClick={() => setShowAllModal(true)}
          variant="outline"
          className="w-full mt-3 border-white/10 text-white hover:bg-white/5"
        >
          View All Visits
        </Button>
      )}

      <Dialog open={showAllModal} onOpenChange={setShowAllModal}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Complete Visit History</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div>
              <h3 className={`text-sm font-semibold ${myColor} mb-2`}>{myName} (You)</h3>
              <div className="space-y-1">
                {myVisits.map((visit) => renderVisitRow(visit, myName, myColor, true))}
              </div>
            </div>
            <Separator className="bg-white/5" />
            <div>
              <h3 className={`text-sm font-semibold ${opponentColor} mb-2`}>{opponentName}</h3>
              <div className="space-y-1">
                {opponentVisits.map((visit) => renderVisitRow(visit, opponentName, opponentColor, false))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

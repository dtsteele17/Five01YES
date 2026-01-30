'use client';

interface RoundSchedule {
  roundName: string;
  date: string;
  time?: string;
}

interface Tournament {
  id: string;
  name: string;
  startDate: string;
  startTime: string;
  maxParticipants: number;
  participantsCount: number;
  status: 'open' | 'full' | 'started' | 'completed';
  scheduleMode: 'singleDay' | 'multiDay';
  isOfficial: boolean;
  prizePool?: number;
  entryType?: string;
  description?: string;
  legsPerMatch?: number;
  roundDates?: RoundSchedule[];
  isRegistered?: boolean;
}
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users, DollarSign, Trophy, Clock, Shield } from 'lucide-react';
import { format } from 'date-fns';

interface TournamentCardProps {
  tournament: Tournament;
  onJoin?: (tournamentId: string) => void;
}

export function TournamentCard({ tournament, onJoin }: TournamentCardProps) {
  const formattedDate = format(new Date(tournament.startDate), 'MMMM d, yyyy');
  const participantPercentage = (tournament.participantsCount / tournament.maxParticipants) * 100;

  const getStatusBadge = () => {
    switch (tournament.status) {
      case 'open':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Open</Badge>;
      case 'full':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Full</Badge>;
      case 'started':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Completed</Badge>;
    }
  };

  return (
    <div
      className={`p-6 rounded-xl border transition-all hover:scale-[1.02] ${
        tournament.isOfficial
          ? 'bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border-teal-500/30 shadow-lg shadow-teal-500/10'
          : 'bg-slate-800/50 border-white/10 hover:border-white/20'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {tournament.isOfficial && (
              <Badge className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white border-0">
                <Trophy className="w-3 h-3 mr-1" />
                Official
              </Badge>
            )}
            {tournament.entryType === 'invite' && (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                <Shield className="w-3 h-3 mr-1" />
                Invite Only
              </Badge>
            )}
            {tournament.scheduleMode === 'multiDay' && (
              <Badge variant="outline" className="border-orange-500/30 text-orange-400">
                Multi-Day
              </Badge>
            )}
          </div>
          <h3 className="text-white font-semibold text-lg mb-1">{tournament.name}</h3>
          {tournament.description && (
            <p className="text-gray-400 text-sm line-clamp-2 mb-3">{tournament.description}</p>
          )}
        </div>
        {getStatusBadge()}
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center text-gray-300 text-sm">
          <Calendar className="w-4 h-4 mr-2 text-teal-400" />
          {formattedDate}
        </div>
        <div className="flex items-center text-gray-300 text-sm">
          <Clock className="w-4 h-4 mr-2 text-teal-400" />
          {tournament.startTime}
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center text-gray-300">
            <Users className="w-4 h-4 mr-2 text-teal-400" />
            {tournament.participantsCount}/{tournament.maxParticipants} players
          </div>
          <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all"
              style={{ width: `${participantPercentage}%` }}
            />
          </div>
        </div>
        {tournament.prizePool && (
          <div className="flex items-center text-gray-300 text-sm">
            <DollarSign className="w-4 h-4 mr-2 text-yellow-400" />
            <span className="text-yellow-400 font-semibold">${tournament.prizePool} prize pool</span>
          </div>
        )}
      </div>

      {tournament.scheduleMode === 'multiDay' && tournament.roundDates && (
        <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
          <p className="text-xs text-gray-400 mb-2">Schedule:</p>
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-300">
            {tournament.roundDates.slice(0, 4).map((round, idx) => (
              <div key={idx}>
                {round.roundName}: {format(new Date(round.date), 'MMM d')}
              </div>
            ))}
          </div>
          {tournament.roundDates.length > 4 && (
            <p className="text-xs text-gray-500 mt-1">+{tournament.roundDates.length - 4} more rounds</p>
          )}
        </div>
      )}

      <Button
        className={
          tournament.isOfficial
            ? 'w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white'
            : 'w-full'
        }
        disabled={tournament.status === 'full' || tournament.status === 'completed'}
        onClick={() => onJoin?.(tournament.id)}
      >
        {tournament.isRegistered
          ? 'View Tournament'
          : tournament.status === 'full'
          ? 'Full'
          : tournament.status === 'started'
          ? 'View Bracket'
          : 'Register Now'}
      </Button>
    </div>
  );
}

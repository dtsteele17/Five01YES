'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
function getRoundCount(maxParticipants: number): number {
  switch (maxParticipants) {
    case 4:
      return 2;
    case 8:
      return 3;
    case 16:
      return 4;
    case 32:
      return 5;
    case 64:
      return 6;
    case 128:
      return 7;
    default:
      return 0;
  }
}

function getRoundNames(maxParticipants: number): string[] {
  const totalRounds = getRoundCount(maxParticipants);
  const rounds: string[] = [];

  if (maxParticipants === 4) {
    return ['Semifinals', 'Final'];
  }

  if (maxParticipants === 8) {
    return ['Quarterfinals', 'Semifinals', 'Final'];
  }

  for (let i = 1; i <= totalRounds - 3; i++) {
    rounds.push(`Round ${i}`);
  }

  if (totalRounds >= 3) {
    rounds.push('Quarterfinals', 'Semifinals', 'Final');
  } else if (totalRounds === 2) {
    rounds.push('Semifinals', 'Final');
  } else if (totalRounds === 1) {
    rounds.push('Final');
  }

  return rounds;
}

function addDaysToDate(dateString: string, days: number): string {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
import { Tournament, TournamentSize } from '@/lib/types/tournament';
import { useTournaments } from '@/lib/context/TournamentsContext';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { createTournament } from '@/lib/db/tournaments';
import { useRouter } from 'next/navigation';

interface CreateTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTournamentCreated?: (tournamentId: string) => void;
}

export function CreateTournamentModal({ isOpen, onClose, onTournamentCreated }: CreateTournamentModalProps) {
  const router = useRouter();
  const { dispatch, state } = useTournaments();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [maxParticipants, setMaxParticipants] = useState<TournamentSize>(16);
  const [scheduleMode, setScheduleMode] = useState<'one-day' | 'multi-day'>('one-day');
  const [entryType, setEntryType] = useState<'open' | 'invite'>('open');
  const [description, setDescription] = useState('');
  const [legsPerMatch, setLegsPerMatch] = useState<number>(5);
  const [useSameTime, setUseSameTime] = useState(true);
  const [roundDates, setRoundDates] = useState<{ date: string; time: string }[]>([]);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roundNames = getRoundNames(maxParticipants);

  const handleMaxParticipantsChange = (value: string) => {
    const newMax = parseInt(value) as TournamentSize;
    setMaxParticipants(newMax);

    if (scheduleMode === 'multi-day' && startDate) {
      const names = getRoundNames(newMax);
      const dates = names.map((_, idx) => ({
        date: addDaysToDate(startDate, idx),
        time: startTime,
      }));
      setRoundDates(dates);
    }
  };

  const handleScheduleModeChange = (mode: 'one-day' | 'multi-day') => {
    setScheduleMode(mode);

    if (mode === 'multi-day' && startDate) {
      const dates = roundNames.map((_, idx) => ({
        date: addDaysToDate(startDate, idx),
        time: startTime,
      }));
      setRoundDates(dates);
    } else {
      setRoundDates([]);
    }
  };

  const handleStartDateChange = (date: string) => {
    setStartDate(date);

    if (scheduleMode === 'multi-day') {
      const dates = roundNames.map((_, idx) => ({
        date: addDaysToDate(date, idx),
        time: useSameTime ? startTime : roundDates[idx]?.time || startTime,
      }));
      setRoundDates(dates);
    }
  };

  const handleRoundDateChange = (index: number, date: string) => {
    const newRoundDates = [...roundDates];
    newRoundDates[index] = { ...newRoundDates[index], date };
    setRoundDates(newRoundDates);
  };

  const handleRoundTimeChange = (index: number, time: string) => {
    const newRoundDates = [...roundDates];
    newRoundDates[index] = { ...newRoundDates[index], time };
    setRoundDates(newRoundDates);
  };

  const handleUseSameTimeChange = (checked: boolean) => {
    setUseSameTime(checked);

    if (checked && scheduleMode === 'multi-day') {
      const dates = roundDates.map(rd => ({ ...rd, time: startTime }));
      setRoundDates(dates);
    }
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!name || name.length < 3) {
      newErrors.name = 'Tournament name must be at least 3 characters';
    }

    if (!startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (!startTime) {
      newErrors.startTime = 'Start time is required';
    }

    if (scheduleMode === 'multi-day') {
      roundDates.forEach((rd, idx) => {
        if (!rd.date) {
          newErrors[`round-${idx}`] = `${roundNames[idx]} date is required`;
        } else if (new Date(rd.date) < new Date(startDate)) {
          newErrors[`round-${idx}`] = `Date cannot be before tournament start date`;
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error('Please fix all validation errors');
      return;
    }

    setIsSubmitting(true);

    try {
      const tournament = await createTournament({
        name,
        startDate,
        startTime,
        maxParticipants,
        schedulingMode: scheduleMode,
        entryType,
        legsPerMatch,
        description: description || undefined,
        startingScore: 501,
        doubleOut: true,
        straightIn: true,
      });

      toast.success('Tournament created successfully!');

      if (onTournamentCreated) {
        onTournamentCreated(tournament.id);
      }

      handleClose();

      router.push(`/app/tournaments/${tournament.id}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create tournament');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setName('');
      setStartDate('');
      setStartTime('18:00');
      setMaxParticipants(16);
      setScheduleMode('one-day');
      setEntryType('open');
      setDescription('');
      setLegsPerMatch(5);
      setUseSameTime(true);
      setRoundDates([]);
      setErrors({});
      setIsSubmitting(false);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Create Tournament</DialogTitle>
          <p className="text-gray-400 text-sm">Set your format and schedule.</p>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          <div>
            <Label htmlFor="name" className="text-white">
              Tournament Name *
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter tournament name"
              className="mt-2 bg-slate-800/50 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500 focus:ring-teal-500/20"
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate" className="text-white">
                Start Date *
              </Label>
              <div className="relative mt-2">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="pl-10 bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20"
                />
              </div>
              {errors.startDate && <p className="text-red-400 text-xs mt-1">{errors.startDate}</p>}
            </div>

            <div>
              <Label htmlFor="startTime" className="text-white">
                Start Time *
              </Label>
              <div className="relative mt-2">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="pl-10 bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20"
                />
              </div>
              {errors.startTime && <p className="text-red-400 text-xs mt-1">{errors.startTime}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="maxParticipants" className="text-white">
              Max Participants *
            </Label>
            <Select value={maxParticipants.toString()} onValueChange={handleMaxParticipantsChange}>
              <SelectTrigger className="mt-2 bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="4">4</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="16">16</SelectItem>
                <SelectItem value="32">32</SelectItem>
                <SelectItem value="64">64</SelectItem>
                <SelectItem value="128">128</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400 mt-1">Bracket size must match max participants.</p>
          </div>

          <div>
            <Label className="text-white mb-3 block">Round Scheduling</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={scheduleMode === 'one-day' ? 'default' : 'outline'}
                onClick={() => handleScheduleModeChange('one-day')}
                className={
                  scheduleMode === 'one-day'
                    ? 'flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white'
                    : 'flex-1 border-white/10 text-white hover:bg-white/5'
                }
              >
                One Day
              </Button>
              <Button
                type="button"
                variant={scheduleMode === 'multi-day' ? 'default' : 'outline'}
                onClick={() => handleScheduleModeChange('multi-day')}
                className={
                  scheduleMode === 'multi-day'
                    ? 'flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white'
                    : 'flex-1 border-white/10 text-white hover:bg-white/5'
                }
              >
                Multi-Day
              </Button>
            </div>
          </div>

          {scheduleMode === 'multi-day' && (
            <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg border border-white/10">
              <div className="flex items-center justify-between">
                <Label className="text-white">Use same start time for all rounds</Label>
                <Switch checked={useSameTime} onCheckedChange={handleUseSameTimeChange} />
              </div>

              <div className="space-y-3">
                {roundNames.map((roundName, idx) => (
                  <div key={idx}>
                    <Label className="text-gray-300 text-sm">{roundName}</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        type="date"
                        value={roundDates[idx]?.date || ''}
                        onChange={(e) => handleRoundDateChange(idx, e.target.value)}
                        className="bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20"
                      />
                      {!useSameTime && (
                        <Input
                          type="time"
                          value={roundDates[idx]?.time || ''}
                          onChange={(e) => handleRoundTimeChange(idx, e.target.value)}
                          className="w-32 bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20"
                        />
                      )}
                    </div>
                    {errors[`round-${idx}`] && (
                      <p className="text-red-400 text-xs mt-1">{errors[`round-${idx}`]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-white mb-3 block">Entry Type</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={entryType === 'open' ? 'default' : 'outline'}
                onClick={() => setEntryType('open')}
                className={
                  entryType === 'open'
                    ? 'flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white'
                    : 'flex-1 border-white/10 text-white hover:bg-white/5'
                }
              >
                Open
              </Button>
              <Button
                type="button"
                variant={entryType === 'invite' ? 'default' : 'outline'}
                onClick={() => setEntryType('invite')}
                className={
                  entryType === 'invite'
                    ? 'flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white'
                    : 'flex-1 border-white/10 text-white hover:bg-white/5'
                }
              >
                Invite Only
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="legsPerMatch" className="text-white">
              Legs per Match
            </Label>
            <Select value={legsPerMatch.toString()} onValueChange={(value) => setLegsPerMatch(parseInt(value))}>
              <SelectTrigger className="mt-2 bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="3">Best of 3</SelectItem>
                <SelectItem value="5">Best of 5</SelectItem>
                <SelectItem value="7">Best of 7</SelectItem>
                <SelectItem value="9">Best of 9</SelectItem>
                <SelectItem value="11">Best of 11</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description" className="text-white">
              Description (Optional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your tournament..."
              rows={3}
              className="mt-2 bg-slate-800/50 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500 focus:ring-teal-500/20"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={handleClose} className="flex-1 border-white/10 text-white hover:bg-white/5">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white"
          >
            {isSubmitting ? 'Creating...' : 'Create Tournament'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

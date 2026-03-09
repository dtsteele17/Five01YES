'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { X, ChevronRight, ChevronLeft, Trophy } from 'lucide-react';
import { DayPickerChips } from './DayPickerChips';
import { PlayoffSelector } from './PlayoffSelector';
import { toast } from 'sonner';

interface CreateLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeagueCreated: (leagueId: string) => void;
}

export function CreateLeagueModal({ isOpen, onClose, onLeagueCreated }: CreateLeagueModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState('basics');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [formData, setFormData] = useState({
    name: '',
    maxParticipants: 16,
    access: 'open' as 'invite' | 'open',
    startDate: '',
    matchDays: [] as string[],
    matchTime: '19:00',
    gamesPerDay: 3,
    legsPerGame: 5,
    cameraRequired: false,
    playoffs: 'top4' as 'top8' | 'top4' | 'top2_final' | 'none',
  });

  const [errors, setErrors] = useState({
    name: '',
    matchDays: '',
    startDate: '',
  });

  const validateBasics = () => {
    const newErrors = { name: '', matchDays: '', startDate: '' };
    let isValid = true;

    if (!formData.name || formData.name.length < 3) {
      newErrors.name = 'League name must be at least 3 characters';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const validateSchedule = () => {
    const newErrors = { name: '', matchDays: '', startDate: '' };
    let isValid = true;

    if (formData.matchDays.length === 0) {
      newErrors.matchDays = 'Select at least one match day';
      isValid = false;
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
      isValid = false;
    } else {
      const selectedDate = new Date(formData.startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        newErrors.startDate = 'Start date must be today or later';
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleNext = () => {
    console.log('Next clicked from tab:', activeTab);

    if (activeTab === 'basics') {
      const isValid = validateBasics();
      console.log('Basics validation:', isValid);
      if (isValid) {
        setActiveTab('schedule');
      } else {
        toast.error('Please fill in all required fields');
      }
    } else if (activeTab === 'schedule') {
      const isValid = validateSchedule();
      console.log('Schedule validation:', isValid);
      if (isValid) {
        setActiveTab('rules');
      } else {
        toast.error('Please complete the schedule settings');
      }
    } else if (activeTab === 'rules') {
      console.log('Moving to playoffs');
      setActiveTab('playoffs');
    } else if (activeTab === 'playoffs') {
      console.log('Moving to review');
      setActiveTab('review');
    }
  };

  const handleBack = () => {
    if (activeTab === 'schedule') setActiveTab('basics');
    else if (activeTab === 'rules') setActiveTab('schedule');
    else if (activeTab === 'playoffs') setActiveTab('rules');
    else if (activeTab === 'review') setActiveTab('playoffs');
  };

  const handleCreateLeague = async () => {
    setErrorMessage('');
    console.log('[CREATE LEAGUE] Starting creation with form data:', formData);

    try {
      // Validate form
      const basicsValid = validateBasics();
      const scheduleValid = validateSchedule();

      if (!basicsValid || !scheduleValid) {
        console.error('[CREATE LEAGUE] Validation failed:', { basicsValid, scheduleValid });
        setErrorMessage('Please fix all validation errors before creating the league.');
        toast.error('Please fix validation errors');
        return;
      }

      setIsSubmitting(true);

      // Convert day names to numbers (Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6)
      const dayMap: Record<string, number> = {
        'Sun': 0,
        'Mon': 1,
        'Tue': 2,
        'Wed': 3,
        'Thu': 4,
        'Fri': 5,
        'Sat': 6,
      };

      const matchDaysNumbers = formData.matchDays.map(day => {
        const dayNum = dayMap[day];
        if (dayNum === undefined) {
          throw new Error(`Invalid day: ${day}`);
        }
        return dayNum;
      });

      console.log('[CREATE LEAGUE] Converted match days:', formData.matchDays, '->', matchDaysNumbers);

      // Call Supabase RPC
      console.log('[CREATE LEAGUE] Calling rpc_create_league...');
      const { data: result, error } = await supabase.rpc('rpc_create_league', {
        p_name: formData.name,
        p_description: '',
        p_max_participants: formData.maxParticipants || 16,
        p_access_type: formData.access,
        p_start_date: formData.startDate,
        p_match_days: formData.matchDays,
        p_match_time: formData.matchTime,
        p_games_per_day: formData.gamesPerDay,
        p_legs_per_game: formData.legsPerGame,
        p_camera_required: formData.cameraRequired ?? true,
        p_playoff_type: formData.playoffs,
      });
      const leagueId = result?.league_id;

      if (error) {
        console.error('[CREATE LEAGUE] RPC Error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw new Error(error.message || 'Failed to create league');
      }

      if (!leagueId) {
        throw new Error('No league ID returned from server');
      }

      console.log('[CREATE LEAGUE] League created successfully:', leagueId);
      toast.success('League created successfully!');

      // Navigate to the new league page
      router.push(`/app/leagues/${leagueId}`);

      // Call the callback
      onLeagueCreated(leagueId);

      // Close the modal
      onClose();
    } catch (error: any) {
      console.error('[CREATE LEAGUE] Error:', error);
      const errorMsg = error?.message || 'Failed to create league';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      maxParticipants: 16,
      access: 'open',
      startDate: '',
      matchDays: [],
      matchTime: '19:00',
      gamesPerDay: 3,
      legsPerGame: 5,
      cameraRequired: false,
      playoffs: 'top4',
    });
    setErrors({ name: '', matchDays: '', startDate: '' });
    setActiveTab('basics');
    setErrorMessage('');
    setIsSubmitting(false);
    onClose();
  };

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  console.log('Current tab:', activeTab);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border border-white/10 text-white max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
                Create League
              </DialogTitle>
              <p className="text-gray-400 text-sm mt-1">Configure your season settings (Step: {activeTab})</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-5 bg-slate-800/50 p-1 rounded-lg border border-white/5">
            <TabsTrigger
              value="basics"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white rounded-md transition-all"
            >
              Basics
            </TabsTrigger>
            <TabsTrigger
              value="schedule"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white rounded-md transition-all"
            >
              Schedule
            </TabsTrigger>
            <TabsTrigger
              value="rules"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white rounded-md transition-all"
            >
              Rules
            </TabsTrigger>
            <TabsTrigger
              value="playoffs"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white rounded-md transition-all"
            >
              Playoffs
            </TabsTrigger>
            <TabsTrigger
              value="review"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white rounded-md transition-all"
            >
              Review
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">League Name *</Label>
                <Input
                  placeholder="Enter league name..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-slate-800/50 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500 focus:ring-teal-500/20"
                />
                {errors.name && <p className="text-sm text-red-400">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Max Participants</Label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="4"
                    max="64"
                    step="1"
                    value={formData.maxParticipants}
                    onChange={(e) => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) })}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
                  />
                  <span className="text-white font-semibold text-lg min-w-[3ch]">{formData.maxParticipants}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Access Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormData({ ...formData, access: 'open' })}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      formData.access === 'open'
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-white/10 bg-slate-800/30 hover:border-white/20'
                    }`}
                  >
                    <div className="text-white font-semibold mb-1">Open</div>
                    <div className="text-gray-400 text-xs">Anyone can join</div>
                  </button>
                  <button
                    onClick={() => setFormData({ ...formData, access: 'invite' })}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      formData.access === 'invite'
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-white/10 bg-slate-800/30 hover:border-white/20'
                    }`}
                  >
                    <div className="text-white font-semibold mb-1">Invite Only</div>
                    <div className="text-gray-400 text-xs">Requires invitation</div>
                  </button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Start Date *</Label>
                <Input
                  type="date"
                  min={getMinDate()}
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20"
                />
                {errors.startDate && <p className="text-sm text-red-400">{errors.startDate}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Match Days *</Label>
                <DayPickerChips
                  selectedDays={formData.matchDays}
                  onChange={(days) => setFormData({ ...formData, matchDays: days })}
                />
                {errors.matchDays && <p className="text-sm text-red-400">{errors.matchDays}</p>}
                <p className="text-xs text-gray-500">
                  Matches will be scheduled on selected days starting from the start date
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Match Time</Label>
                <Input
                  type="time"
                  value={formData.matchTime}
                  onChange={(e) => setFormData({ ...formData, matchTime: e.target.value })}
                  className="bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Games Per Day</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFormData({ ...formData, gamesPerDay: Math.max(1, formData.gamesPerDay - 1) })}
                    className="border-white/10 hover:bg-white/5 hover:border-teal-500"
                  >
                    -
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-bold text-white">{formData.gamesPerDay}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFormData({ ...formData, gamesPerDay: Math.min(10, formData.gamesPerDay + 1) })}
                    className="border-white/10 hover:bg-white/5 hover:border-teal-500"
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rules" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm font-medium">Legs Per Game</Label>
                <Select
                  value={formData.legsPerGame.toString()}
                  onValueChange={(value) => setFormData({ ...formData, legsPerGame: parseInt(value) })}
                >
                  <SelectTrigger className="bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20">
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

              <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-white/5">
                <div>
                  <Label className="text-white font-medium">Camera Required</Label>
                  <p className="text-xs text-gray-400 mt-1">Require players to verify throws with camera</p>
                </div>
                <Switch
                  checked={formData.cameraRequired}
                  onCheckedChange={(checked) => setFormData({ ...formData, cameraRequired: checked })}
                  className="data-[state=checked]:bg-teal-500"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="playoffs" className="space-y-6 mt-6">
            <div className="space-y-4">
              <Label className="text-gray-300 text-sm font-medium">Playoff Format</Label>
              <PlayoffSelector
                value={formData.playoffs}
                onChange={(value) => setFormData({ ...formData, playoffs: value })}
              />
            </div>
          </TabsContent>

          <TabsContent value="review" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="bg-slate-800/30 rounded-lg p-6 border border-white/5 space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{formData.name || 'League Name'}</h3>
                    <p className="text-sm text-gray-400">{formData.access === 'open' ? 'Open League' : 'Invite Only'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Max Participants</p>
                    <p className="text-white font-semibold">{formData.maxParticipants}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Start Date</p>
                    <p className="text-white font-semibold">
                      {formData.startDate ? new Date(formData.startDate).toLocaleDateString() : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Match Days</p>
                    <p className="text-white font-semibold">{formData.matchDays.join(', ') || 'None'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Match Time</p>
                    <p className="text-white font-semibold">{formData.matchTime}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Games Per Day</p>
                    <p className="text-white font-semibold">{formData.gamesPerDay}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Legs Per Game</p>
                    <p className="text-white font-semibold">Best of {formData.legsPerGame}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Camera Required</p>
                    <p className="text-white font-semibold">{formData.cameraRequired ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Playoff Format</p>
                    <p className="text-white font-semibold">
                      {formData.playoffs === 'top8' ? 'Top 8' :
                       formData.playoffs === 'top4' ? 'Top 4' :
                       formData.playoffs === 'top2_final' ? 'Top 2 Final' :
                       'No Playoffs'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {errorMessage && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">!</span>
              </div>
              <div className="flex-1">
                <h4 className="text-red-400 font-semibold mb-1">Error Creating League</h4>
                <p className="text-red-300 text-sm">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/10">
          <Button
            variant="outline"
            onClick={activeTab === 'basics' ? handleClose : handleBack}
            className="border-white/10 text-white hover:bg-white/5"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            {activeTab === 'basics' ? 'Cancel' : 'Back'}
          </Button>

          {activeTab === 'review' ? (
            <Button
              type="button"
              onClick={handleCreateLeague}
              disabled={isSubmitting}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white px-8"
            >
              {isSubmitting ? 'Creating...' : 'Create League'}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleNext}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

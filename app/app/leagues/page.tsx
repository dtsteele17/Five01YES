'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  Trophy,
  Plus,
  Crown,
  Medal,
  Calendar,
} from 'lucide-react';
import { CreateLeagueModal } from '@/components/app/CreateLeagueModal';
import { useLeagues } from '@/lib/context/LeaguesContext';

export default function LeaguesPage() {
  const router = useRouter();
  const { state } = useLeagues();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const myLeagues = state.leagues;

  const getLeagueColor = (index: number) => {
    const colors = [
      'from-yellow-500 to-orange-500',
      'from-blue-500 to-cyan-500',
      'from-emerald-500 to-teal-500',
      'from-purple-500 to-pink-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Leagues</h1>
          <p className="text-gray-400">Join or create leagues and compete with others.</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create League
        </Button>
      </div>

      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <h2 className="text-xl font-bold text-white mb-6">Your Leagues</h2>

        {myLeagues.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">You haven't joined any leagues yet</p>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
            >
              Create Your First League
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {myLeagues.map((league, index) => (
              <div
                key={league.id}
                className="flex items-center justify-between p-6 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-16 h-16 bg-gradient-to-br ${getLeagueColor(index)} rounded-xl flex items-center justify-center`}>
                    <Trophy className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-1">{league.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-400">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-1" />
                        {league.players.length}/{league.maxParticipants} players
                      </div>
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        Starts {league.startDate.toLocaleDateString()}
                      </div>
                      <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">
                        {league.access === 'invite' ? 'Invite Only' : 'Open'}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-white/10 text-white hover:bg-white/5"
                  onClick={() => router.push(`/app/leagues/${league.id}`)}
                >
                  View League
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <CreateLeagueModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLeagueCreated={(id) => {
          console.log('PARENT_onLeagueCreated', id);
          setIsModalOpen(false);
          router.push(`/app/leagues/${id}`);
          router.refresh();
        }}
      />
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, ArrowRight, Crown, Award, Target, CheckCircle, Mail } from 'lucide-react';

interface FinalTableRow {
  position: number;
  is_player: boolean;
  name: string;
  played: number;
  won: number;
  lost: number;
  legs_for: number;
  legs_against: number;
  legs_diff: number;
  points: number;
  average: number;
}

interface SeasonEndData {
  final_position: number;
  promoted: boolean;
  final_table: FinalTableRow[];
  performance_email: {
    id: string;
    subject: string;
    body: string;
    type: string;
    isNew: boolean;
  };
}

export default function SeasonEndPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  
  const [loading, setLoading] = useState(true);
  const [seasonData, setSeasonData] = useState<SeasonEndData | null>(null);
  const [advancing, setAdvancing] = useState(false);
  
  useEffect(() => {
    if (careerId) {
      loadSeasonEndData();
    }
  }, [careerId]);

  async function loadSeasonEndData() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_get_career_home_with_season_end', {
        p_career_id: careerId
      });
      
      if (error) throw error;
      
      if (data?.season_end?.active) {
        setSeasonData(data.season_end);
      } else {
        // No active season end, redirect back to career
        router.push(`/app/career?id=${careerId}`);
      }
    } catch (err: any) {
      toast.error('Failed to load season end data');
      console.error(err);
      router.push(`/app/career?id=${careerId}`);
    } finally {
      setLoading(false);
    }
  }

  async function advanceSeason() {
    if (!careerId) return;
    
    setAdvancing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_career_advance_season', {
        p_career_id: careerId
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success(data.message || 'New season started!');
      router.push(`/app/career?id=${careerId}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to advance season');
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-4 animate-pulse" />
          <p className="text-white">Loading season results...</p>
        </div>
      </div>
    );
  }

  if (!seasonData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center text-white">
          <p>Season end data not available</p>
          <Button onClick={() => router.push(`/app/career?id=${careerId}`)} className="mt-4">
            Return to Career
          </Button>
        </div>
      </div>
    );
  }

  const getPositionColor = (position: number) => {
    if (position <= 2) return 'text-green-400';
    if (position <= 4) return 'text-blue-400';
    if (position >= 7) return 'text-red-400';
    return 'text-slate-300';
  };

  const getPositionBadge = (position: number, promoted: boolean) => {
    if (promoted) return <Badge className="bg-green-500/20 text-green-300 border-green-500">PROMOTED</Badge>;
    if (position <= 2) return <Badge className="bg-green-500/20 text-green-300 border-green-500">PROMOTION</Badge>;
    if (position >= 7) return <Badge className="bg-red-500/20 text-red-300 border-red-500">RELEGATION ZONE</Badge>;
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <Trophy className="w-8 h-8 text-amber-400" />
            <h1 className="text-4xl font-black">Season Complete!</h1>
            <Trophy className="w-8 h-8 text-amber-400" />
          </div>
          
          <div className="flex items-center justify-center gap-4 mb-6">
            <Badge className={`text-2xl px-4 py-2 ${seasonData.promoted ? 'bg-green-500/20 text-green-300 border-green-500' : 'bg-slate-700/50'}`}>
              Final Position: #{seasonData.final_position}
            </Badge>
            {getPositionBadge(seasonData.final_position, seasonData.promoted)}
          </div>

          {seasonData.promoted && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
              className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/30 rounded-lg p-6 mb-6"
            >
              <Crown className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-green-300 mb-2">🎉 PROMOTED!</h2>
              <p className="text-green-200">You&apos;ve earned promotion to the next tier. Well done!</p>
            </motion.div>
          )}
        </motion.div>

        {/* Final League Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-slate-800/50 border-slate-700 mb-8">
            <div className="p-6">
              <h3 className="text-xl font-bold text-center mb-6 flex items-center justify-center gap-2">
                <Award className="w-6 h-6 text-amber-400" />
                Final League Table
                <Award className="w-6 h-6 text-amber-400" />
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-sm text-slate-400 border-b border-slate-700">
                      <th className="text-left p-3">Pos</th>
                      <th className="text-left p-3">Player</th>
                      <th className="text-center p-3">P</th>
                      <th className="text-center p-3">W</th>
                      <th className="text-center p-3">L</th>
                      <th className="text-center p-3">LF</th>
                      <th className="text-center p-3">LA</th>
                      <th className="text-center p-3">+/-</th>
                      <th className="text-center p-3">Pts</th>
                      <th className="text-center p-3">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonData.final_table?.map((row, index) => (
                      <motion.tr
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index }}
                        className={`
                          border-b border-slate-800 transition-all
                          ${row.is_player ? 'bg-amber-500/10 border-amber-500/30' : 'hover:bg-slate-700/30'}
                        `}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${getPositionColor(row.position)}`}>
                              {row.position}
                            </span>
                            {row.position <= 2 && (
                              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            )}
                            {row.position >= 7 && (
                              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {row.is_player && <Target className="w-4 h-4 text-amber-400" />}
                            <span className={`font-medium ${row.is_player ? 'text-amber-300' : 'text-white'}`}>
                              {row.name}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-center">{row.played}</td>
                        <td className="p-3 text-center text-green-400">{row.won}</td>
                        <td className="p-3 text-center text-red-400">{row.lost}</td>
                        <td className="p-3 text-center">{row.legs_for}</td>
                        <td className="p-3 text-center">{row.legs_against}</td>
                        <td className={`p-3 text-center ${row.legs_diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {row.legs_diff > 0 ? '+' : ''}{row.legs_diff}
                        </td>
                        <td className="p-3 text-center font-bold">{row.points}</td>
                        <td className="p-3 text-center">{row.average?.toFixed(1) || '0.0'}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Performance Email Preview */}
        {seasonData.performance_email && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-slate-600 mb-8">
              <div className="p-6">
                <h3 className="text-lg font-bold text-center mb-4 flex items-center justify-center gap-2">
                  <Mail className="w-5 h-5 text-blue-400" />
                  Season Performance Report
                </h3>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h4 className="font-bold text-blue-300 mb-2">{seasonData.performance_email.subject}</h4>
                  <div className="text-slate-300 whitespace-pre-line text-sm leading-relaxed">
                    {seasonData.performance_email.body}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Advance Season Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center"
        >
          <Button
            onClick={advanceSeason}
            disabled={advancing}
            size="lg"
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xl px-8 py-4"
          >
            {advancing ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-3"></div>
                Advancing Season...
              </>
            ) : (
              <>
                <CheckCircle className="w-6 h-6 mr-3" />
                {seasonData.promoted ? 'Start Next Tier' : 'Start New Season'}
                <ArrowRight className="w-6 h-6 ml-3" />
              </>
            )}
          </Button>
          
          <p className="text-slate-400 text-sm mt-4 max-w-md mx-auto">
            {seasonData.promoted 
              ? 'Ready to take on the challenges of a higher tier?'
              : 'Fresh opponents await in the new season. Time for redemption!'}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
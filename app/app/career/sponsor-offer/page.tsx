'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Award, Star, TrendingUp, ChevronRight, Clock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface SponsorOffer {
  careerId: string;
  trigger_type: 'win_streak' | 'tournament_final';
  sponsors: Array<{
    id: string;
    name: string;
    rep_bonus_pct: number;
    flavour_text: string;
  }>;
  career: {
    tier: number;
    season: number;
    week: number;
  };
}

export default function SponsorOfferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SponsorOffer | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [selectedSponsor, setSelectedSponsor] = useState<string | null>(null);

  useEffect(() => {
    if (careerId) {
      loadSponsorOffer();
    }
  }, [careerId]);

  async function loadSponsorOffer() {
    if (!careerId) return;

    try {
      const supabase = createClient();
      
      // Check for sponsor offers
      const { data: sponsorData, error } = await supabase.rpc('rpc_fifa_check_sponsor_offers', {
        p_career_id: careerId
      });
      
      if (error) throw error;
      
      if (!sponsorData?.sponsor_offer) {
        // No sponsor offer available, redirect back to career
        router.push(`/app/career?id=${careerId}`);
        return;
      }
      
      // Get career details
      const { data: careerData, error: careerError } = await supabase
        .from('career_profiles')
        .select('tier, season, week')
        .eq('id', careerId)
        .single();
      
      if (careerError) throw careerError;
      
      setData({
        careerId,
        trigger_type: sponsorData.trigger_type,
        sponsors: sponsorData.sponsors,
        career: careerData
      });
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to load sponsor offer');
      router.push(`/app/career?id=${careerId}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptSponsor(sponsorId: string) {
    if (!careerId) return;
    
    setAccepting(true);
    setSelectedSponsor(sponsorId);
    
    try {
      const supabase = createClient();
      
      const { data: result, error } = await supabase.rpc('rpc_fifa_accept_sponsor', {
        p_career_id: careerId,
        p_sponsor_id: sponsorId
      });
      
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      
      toast.success(`Signed with ${result.sponsor_name}! +${(result.rep_bonus_pct * 100).toFixed(0)}% REP bonus`);
      router.push(`/app/career?id=${careerId}`);
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept sponsor');
    } finally {
      setAccepting(false);
      setSelectedSponsor(null);
    }
  }

  function handleDecline() {
    // For now, just redirect back. In a full implementation, might track declined offers
    router.push(`/app/career?id=${careerId}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Award className="w-12 h-12 text-purple-400 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">Loading sponsor offers...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">No sponsor offers available</h2>
          <Button onClick={() => router.push(`/app/career?id=${careerId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Career
          </Button>
        </div>
      </div>
    );
  }

  const { sponsors, trigger_type, career } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button 
            variant="ghost" 
            onClick={() => router.push(`/app/career?id=${careerId}`)}
            className="text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Career
          </Button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white">Sponsor Offers</h1>
            <p className="text-slate-400">
              County League • Season {career.season} • Week {career.week}
            </p>
          </div>
          <div className="w-24" /> {/* Spacer */}
        </div>

        {/* FIFA-style Sponsor Interest Header */}
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border-purple-500/30 p-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-4">
                <Award className="w-12 h-12 text-purple-400 mr-3" />
                <Sparkles className="w-8 h-8 text-yellow-400 animate-pulse" />
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-2">Sponsors Are Interested!</h2>
              
              <p className="text-purple-200 text-lg mb-4">
                {trigger_type === 'win_streak' 
                  ? 'Your 3-match winning streak has caught the attention of sponsors!'
                  : 'Reaching the tournament final has impressed potential sponsors!'
                }
              </p>
              
              <div className="flex items-center justify-center gap-4">
                <Badge variant="outline" className="text-purple-400 border-purple-500/30">
                  FIFA-Style Sponsor System
                </Badge>
                <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">
                  REP Bonus Available
                </Badge>
              </div>
            </div>
          </Card>
        </div>

        {/* Sponsor Options */}
        <div className="space-y-6 mb-8">
          <h3 className="text-xl font-bold text-white text-center mb-6">
            Choose your sponsor partner:
          </h3>
          
          {sponsors.map((sponsor) => (
            <Card 
              key={sponsor.id}
              className="bg-slate-800/50 border-white/10 hover:border-purple-500/30 transition-all group p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border border-purple-500/20 flex items-center justify-center group-hover:from-purple-500/30 group-hover:to-indigo-600/30 group-hover:border-purple-500/40 transition-all">
                    <Award className="w-8 h-8 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-2xl font-bold text-white mb-2">{sponsor.name}</h4>
                    <p className="text-slate-300 text-lg mb-3">{sponsor.flavour_text}</p>
                    
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <span className="text-green-400 font-bold">
                          +{(sponsor.rep_bonus_pct * 100).toFixed(0)}% REP Bonus
                        </span>
                      </div>
                      <div className="text-slate-500 text-sm">
                        Earn extra REP on every match win
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Sponsor Benefits */}
              <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
                <h5 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  Sponsorship Benefits
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-slate-300">
                      +{(sponsor.rep_bonus_pct * 100).toFixed(0)}% REP on match wins
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-slate-300">Contract until season end</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-400" />
                    <span className="text-slate-300">Visible branding in matches</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    <span className="text-slate-300">Career milestone bonuses</span>
                  </div>
                </div>
              </div>
              
              <Button 
                onClick={() => handleAcceptSponsor(sponsor.id)}
                disabled={accepting}
                className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-semibold py-3 text-lg"
              >
                {accepting && selectedSponsor === sponsor.id ? (
                  <>
                    <Clock className="w-5 h-5 mr-2 animate-spin" />
                    Signing Contract...
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-5 h-5 mr-2" />
                    Sign with {sponsor.name}
                  </>
                )}
              </Button>
            </Card>
          ))}
        </div>

        {/* Decline Option */}
        <Card className="bg-slate-800/30 border-slate-600/30 p-6 mb-8">
          <div className="text-center">
            <h4 className="text-lg font-semibold text-white mb-3">Not Ready for Sponsorship?</h4>
            <p className="text-slate-400 mb-4">
              You can decline these offers and continue without a sponsor. New opportunities may arise based on your performance.
            </p>
            <Button 
              variant="outline"
              onClick={handleDecline}
              disabled={accepting}
              className="border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
            >
              Decline All Offers
            </Button>
          </div>
        </Card>

        {/* FIFA-style Info Panel */}
        <Card className="bg-slate-800/30 border-white/5 p-6">
          <div className="text-center">
            <h4 className="text-lg font-semibold text-white mb-3">FIFA-Style Sponsor System</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-400">
              <div>
                <div className="font-semibold text-white mb-1">Performance-Based</div>
                <div>Triggered by win streaks or tournament success</div>
              </div>
              <div>
                <div className="font-semibold text-white mb-1">REP Bonuses</div>
                <div>Earn extra reputation points for career progression</div>
              </div>
              <div>
                <div className="font-semibold text-white mb-1">Career Impact</div>
                <div>Sponsors are removed if you get relegated to lower tiers</div>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-slate-500">
                Your choice is permanent for this season • 
                Only one sponsor can be active at a time • 
                New offers may become available based on future performance
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, ArrowLeft, Loader2, Star, CheckCircle, 
  TrendingUp, Award, Zap, Target 
} from 'lucide-react';

interface Sponsor {
  id: string;
  name: string;
  rep_bonus_pct: number;
  rep_objectives: Array<{
    condition: string;
    bonus_rep: number;
    description: string;
  }>;
  flavour_text: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

interface SponsorOffer {
  sponsor_offer: boolean;
  sponsors: Sponsor[];
  trigger_reason: string;
}

const RARITY_COLORS = {
  common: 'bg-gray-500/20 text-gray-300 border-gray-500',
  uncommon: 'bg-green-500/20 text-green-300 border-green-500',
  rare: 'bg-blue-500/20 text-blue-300 border-blue-500',
  legendary: 'bg-purple-500/20 text-purple-300 border-purple-500'
};

const RARITY_ICONS = {
  common: Star,
  uncommon: Target,
  rare: Award, 
  legendary: Zap
};

export default function SponsorOfferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  
  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<SponsorOffer | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  
  useEffect(() => {
    if (careerId) {
      checkSponsorOffer();
    }
  }, [careerId]);

  async function checkSponsorOffer() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_career_check_sponsor_offer', {
        p_career_id: careerId
      });
      
      if (error) throw error;
      
      if (data?.sponsor_offer) {
        setOffer(data);
      } else {
        // No offer available, redirect back
        toast.info(data?.reason || 'No sponsor offers available');
        router.push(`/app/career?id=${careerId}`);
      }
    } catch (err: any) {
      toast.error('Failed to load sponsor offers');
      console.error(err);
      router.push(`/app/career?id=${careerId}`);
    } finally {
      setLoading(false);
    }
  }

  async function acceptSponsor(sponsorId: string) {
    if (!careerId) return;
    
    setAccepting(sponsorId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_career_accept_sponsor', {
        p_career_id: careerId,
        p_sponsor_id: sponsorId,
        p_slot: 1
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success(`🎉 ${data.message}`, { duration: 5000 });
      router.push(`/app/career?id=${careerId}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept sponsor');
    } finally {
      setAccepting(null);
    }
  }

  async function declineOffer() {
    // Just redirect back without accepting any sponsor
    toast.info('Sponsor offers declined');
    router.push(`/app/career?id=${careerId}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white text-center">
          <p>No sponsor offers available</p>
          <Button onClick={() => router.push(`/app/career?id=${careerId}`)} className="mt-4">
            Return to Career
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push(`/app/career?id=${careerId}`)}
            className="text-slate-400 hover:text-white px-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Trophy className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="text-3xl font-black text-white">Sponsor Offers!</h1>
            <p className="text-amber-400 text-sm font-medium">
              🎯 Earned by: {offer.trigger_reason}
            </p>
          </div>
        </div>

        {/* Description */}
        <Card className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border-amber-500/30 mb-8">
          <div className="p-6 text-center">
            <h2 className="text-xl font-bold text-amber-400 mb-2">
              Congratulations! You've caught the attention of sponsors.
            </h2>
            <p className="text-slate-300">
              Choose wisely - your sponsor will provide ongoing bonuses and opportunities throughout your career.
            </p>
          </div>
        </Card>

        {/* Sponsor Options */}
        <div className="grid gap-6 max-w-4xl mx-auto">
          {offer.sponsors.map((sponsor, index) => {
            const RarityIcon = RARITY_ICONS[sponsor.rarity];
            
            return (
              <motion.div
                key={sponsor.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
              >
                <Card className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-slate-600 hover:border-amber-400/50 transition-all">
                  <div className="p-6">
                    {/* Sponsor Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-amber-400/20 p-3 rounded-lg">
                          <RarityIcon className="w-8 h-8 text-amber-400" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-white mb-1">
                            {sponsor.name}
                          </h3>
                          <Badge className={RARITY_COLORS[sponsor.rarity]}>
                            {sponsor.rarity.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="flex items-center gap-2 text-amber-400 font-bold">
                          <TrendingUp className="w-4 h-4" />
                          <span>+{(sponsor.rep_bonus_pct * 100).toFixed(0)}% REP</span>
                        </div>
                      </div>
                    </div>

                    {/* Flavour Text */}
                    <p className="text-slate-300 italic mb-4 text-center">
                      "{sponsor.flavour_text}"
                    </p>

                    {/* Objectives */}
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-amber-400 mb-3">BONUS OBJECTIVES:</h4>
                      <div className="space-y-2">
                        {sponsor.rep_objectives.map((objective, objIndex) => (
                          <div key={objIndex} className="flex items-center justify-between bg-slate-800/50 p-3 rounded">
                            <span className="text-slate-300">{objective.description}</span>
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/50">
                              +{objective.bonus_rep} REP
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Accept Button */}
                    <Button
                      size="lg"
                      className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-lg py-3"
                      disabled={accepting !== null}
                      onClick={() => acceptSponsor(sponsor.id)}
                    >
                      {accepting === sponsor.id ? (
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="w-5 h-5 mr-2" />
                      )}
                      Sign with {sponsor.name}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Decline Option */}
        <div className="text-center mt-8">
          <Button
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
            disabled={accepting !== null}
            onClick={declineOffer}
          >
            Decline All Offers
          </Button>
          <p className="text-slate-500 text-xs mt-2">
            You can still get sponsor offers later based on your performance
          </p>
        </div>
      </div>
    </div>
  );
}
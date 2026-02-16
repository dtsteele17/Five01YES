'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Gamepad2,
  Users,
  Target,
  Trophy,
  Play,
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function LocalPlayPage() {
  const router = useRouter();
  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player2Name, setPlayer2Name] = useState('Player 2');
  const [gameMode, setGameMode] = useState<'301' | '501'>('501');
  const [matchFormat, setMatchFormat] = useState<'1' | '3' | '5' | '7'>('3');
  const [doubleOut, setDoubleOut] = useState(true);

  const handleStartMatch = () => {
    // Build URL with query parameters
    const params = new URLSearchParams({
      p1: player1Name || 'Player 1',
      p2: player2Name || 'Player 2',
      mode: gameMode,
      format: matchFormat,
      doubleOut: doubleOut.toString(),
    });

    router.push(`/app/play/local/match?${params.toString()}`);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <Link href="/app/play">
          <Button variant="outline" size="icon" className="border-slate-700 hover:bg-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white">Local Play</h1>
          <p className="text-slate-400">Pass and play with friends on the same device</p>
        </div>
      </motion.div>

      {/* Setup Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-slate-800/60 border-slate-700/50 p-6 space-y-8">
          {/* Player Names */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Players</h2>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="player1" className="text-slate-300">
                  Player 1 Name
                </Label>
                <Input
                  id="player1"
                  value={player1Name}
                  onChange={(e) => setPlayer1Name(e.target.value)}
                  placeholder="Enter name"
                  className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="player2" className="text-slate-300">
                  Player 2 Name
                </Label>
                <Input
                  id="player2"
                  value={player2Name}
                  onChange={(e) => setPlayer2Name(e.target.value)}
                  placeholder="Enter name"
                  className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>
            </div>
          </div>

          {/* Game Mode */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Game Mode</h2>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-300">Starting Score</Label>
                <Select value={gameMode} onValueChange={(v) => setGameMode(v as '301' | '501')}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="301" className="text-white">301</SelectItem>
                    <SelectItem value="501" className="text-white">501</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-slate-300">Match Format</Label>
                <Select value={matchFormat} onValueChange={(v) => setMatchFormat(v as '1' | '3' | '5' | '7')}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="1" className="text-white">Best of 1</SelectItem>
                    <SelectItem value="3" className="text-white">Best of 3</SelectItem>
                    <SelectItem value="5" className="text-white">Best of 5</SelectItem>
                    <SelectItem value="7" className="text-white">Best of 7</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Gamepad2 className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Options</h2>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
              <div className="space-y-1">
                <Label htmlFor="double-out" className="text-white text-base">Double Out</Label>
                <p className="text-slate-400 text-sm">Must finish on a double</p>
              </div>
              <Switch
                id="double-out"
                checked={doubleOut}
                onCheckedChange={setDoubleOut}
              />
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">Match Summary</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">First to:</span>
                <span className="text-white ml-2 font-medium">
                  {Math.ceil(parseInt(matchFormat) / 2)} legs
                </span>
              </div>
              <div>
                <span className="text-slate-400">Checkout:</span>
                <Badge 
                  variant="outline" 
                  className={`ml-2 ${doubleOut ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-500 text-slate-400'}`}
                >
                  {doubleOut ? 'Double' : 'Any'}
                </Badge>
              </div>
              <div>
                <span className="text-slate-400">Starting:</span>
                <span className="text-white ml-2 font-medium">{gameMode}</span>
              </div>
              <div>
                <span className="text-slate-400">Format:</span>
                <span className="text-white ml-2 font-medium">Best of {matchFormat}</span>
              </div>
            </div>
          </div>

          {/* Start Button */}
          <Button
            onClick={handleStartMatch}
            className="w-full py-6 text-lg font-bold bg-emerald-500 hover:bg-emerald-600"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Match
          </Button>
        </Card>
      </motion.div>

      {/* Instructions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-8 p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl"
      >
        <h3 className="text-sm font-medium text-slate-300 mb-2">How to Play</h3>
        <ul className="text-sm text-slate-400 space-y-1">
          <li>• Player 1 starts the first leg</li>
          <li>• Players alternate turns after each throw</li>
          <li>• First player to reach exactly 0 wins the leg</li>
          <li>• Pass the device to your opponent after each turn</li>
        </ul>
      </motion.div>
    </div>
  );
}

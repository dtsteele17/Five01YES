'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import {
  Target,
  Globe,
  Trophy,
  User,
  TrendingUp,
  Award,
  CheckCircle,
  Instagram,
  Youtube,
  Facebook,
  Twitter,
  MessageCircle,
  Star,
  Zap,
  Shield,
  Clock,
  Video,
  BarChart3,
  Users,
  ChevronDown,
  ArrowRight,
  Cpu,
  Crown,
  Flame,
  Gamepad2,
  Play,
  Sparkles,
  Dices,
  Activity,
  Medal,
  Lock,
  Radio,
  ChevronRight,
  PieChart,
  ArrowUpRight,
  Filter,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TopNav } from '@/components/website/TopNav';
import { getRankImageUrl } from '@/lib/rank-badge-helpers';

// Animated counter hook with easing
function useAnimatedCounter(target: number, duration: number = 2500) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) {
          setHasStarted(true);
        }
      },
      { threshold: 0.3 }
    );
    
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [hasStarted]);
  
  useEffect(() => {
    if (!hasStarted) return;
    
    let startTime: number;
    let animationFrame: number;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(easeOutExpo * target));
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [target, duration, hasStarted]);
  
  return { count, ref };
}

// Parallax wrapper
function ParallaxSection({ children, className = '', offset = 50 }: { children: React.ReactNode; className?: string; offset?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  
  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

// Fade in animation wrapper
function FadeIn({ children, delay = 0, className = '', direction = 'up' }: { children: React.ReactNode; delay?: number; className?: string; direction?: 'up' | 'down' | 'left' | 'right' }) {
  const directions = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { y: 0, x: 40 },
    right: { y: 0, x: -40 },
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, ...directions[direction] }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay, duration: 0.7, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Floating animation component
function FloatingElement({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      animate={{ y: [0, -15, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Rank Badge Component using actual Supabase images
function RankBadge({ tier, size = 80 }: { tier: string; size?: number }) {
  return (
    <img 
      src={getRankImageUrl(tier)} 
      alt={tier}
      width={size}
      height={size}
      className="object-contain"
      onError={(e) => {
        // Fallback to crown icon if image fails
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

export default function Home() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <TopNav scrollToSection={scrollToSection} />

      <main>
        <HeroSection scrollToSection={scrollToSection} />
        <LiveStatsTicker />
        <FeatureShowcase />
        <TrainingModesSection />
        <RankedDivisionsShowcase />
        <ATCFourWaySection />
        <TournamentsLeaguesSection />
        <DartbotShowcase />
        <StatsTrackingSection />
        <VideoVerificationSection />
        <AchievementsPreview />
        <SocialProofSection />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>

      <Footer scrollToSection={scrollToSection} />
    </div>
  );
}

// HERO SECTION - Immersive Entry
function HeroSection({ scrollToSection }: any) {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 150]);
  const y2 = useTransform(scrollY, [0, 500], [0, -100]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-slate-950" />
      
      {/* Animated Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
      
      {/* Floating Orbs */}
      <motion.div style={{ y: y1 }} className="absolute top-20 left-10 w-96 h-96 bg-primary/20 rounded-full blur-[100px] animate-pulse" />
      <motion.div style={{ y: y2 }} className="absolute bottom-20 right-10 w-80 h-80 bg-secondary/20 rounded-full blur-[100px] animate-pulse delay-1000" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[150px]" />

      {/* Content */}
      <motion.div style={{ opacity }} className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
            >
              <Badge className="bg-primary/10 border-primary/30 text-primary px-4 py-1.5 text-sm font-semibold mb-6 inline-flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                The Ultimate Online Darts Experience
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0.4, 0.25, 1] }}
              className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-black text-foreground leading-[0.95] tracking-tight"
            >
              Master Your
              <span className="block bg-gradient-to-r from-primary via-orange-400 to-secondary bg-clip-text text-transparent">
                Dart Game
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
              className="text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed"
            >
              Train with AI, compete in ranked divisions, join tournaments, and play 
              <span className="text-primary font-semibold"> 4-way Around the Clock</span> with video verification.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Link href="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-bold text-lg px-8 h-14 shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all hover:-translate-y-1"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Start Playing Free
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="border-2 font-semibold text-lg px-8 h-14 hover:bg-white/5"
                onClick={() => scrollToSection('features')}
              >
                Explore Features
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-6 justify-center lg:justify-start pt-4"
            >
              <div className="flex -space-x-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div 
                    key={i} 
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 border-2 border-background flex items-center justify-center text-white text-xs font-bold"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-muted-foreground text-sm">Trusted by 12,000+ players</p>
              </div>
            </motion.div>
          </div>

          {/* Right Content - Interactive Preview Cards */}
          <div className="relative hidden lg:block">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ duration: 1, delay: 0.3 }}
              className="relative"
            >
              {/* Main Card */}
              <FloatingElement delay={0}>
                <Card className="p-6 bg-card/80 backdrop-blur-xl border-border/50 shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-500">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-muted-foreground text-sm">Current Rank</p>
                      <p className="text-3xl font-black text-foreground">Gold Division</p>
                    </div>
                    <div className="w-20 h-20 bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-2xl flex items-center justify-center">
                      <RankBadge tier="Gold" size={72} />
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full w-3/4 bg-gradient-to-r from-primary to-secondary" />
                  </div>
                  <p className="text-muted-foreground text-sm mt-2">2,450 / 3,000 RP to Platinum</p>
                </Card>
              </FloatingElement>

              {/* Floating Badge - Quick Match */}
              <FloatingElement delay={0.5} className="absolute -top-8 -left-8">
                <div className="bg-emerald-500 text-white px-4 py-2 rounded-full font-bold shadow-xl flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Quick Match Live
                </div>
              </FloatingElement>

              {/* Floating Badge - Training */}
              <FloatingElement delay={1} className="absolute -bottom-4 -right-4">
                <div className="bg-gradient-to-r from-rose-500 to-orange-500 text-white px-4 py-2 rounded-full font-bold shadow-xl flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  9 Training Modes
                </div>
              </FloatingElement>

              {/* Stats Card */}
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                className="absolute -bottom-12 left-12"
              >
                <Card className="p-4 bg-slate-900/90 border-slate-700/50 shadow-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">3-Dart Average</p>
                      <p className="text-2xl font-black text-white">68.4</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex flex-col items-center gap-2 text-muted-foreground"
        >
          <span className="text-sm">Scroll to explore</span>
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </motion.div>
    </section>
  );
}

// LIVE STATS TICKER
function LiveStatsTicker() {
  const liveMatches = useAnimatedCounter(1247, 2000);
  const activePlayers = useAnimatedCounter(8392, 2500);
  const dartsThrown = useAnimatedCounter(45231, 3000);
  const tournaments = useAnimatedCounter(48, 1500);

  const stats = [
    { label: 'Live Matches', value: liveMatches.count.toLocaleString(), icon: Radio, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    { label: 'Active Players', value: activePlayers.count.toLocaleString(), icon: Users, color: 'text-primary', bg: 'bg-primary/20' },
    { label: 'Darts Today', value: `${(dartsThrown.count / 1000).toFixed(1)}K`, icon: Target, color: 'text-secondary', bg: 'bg-secondary/20' },
    { label: 'Active Tournaments', value: tournaments.count.toString(), icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  ];

  return (
    <div ref={liveMatches.ref} className="border-y border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <FadeIn key={index} delay={index * 0.1}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">{stat.label}</p>
                  <p className="text-2xl font-black text-foreground">{stat.value}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  );
}

// FEATURE SHOWCASE - Main Features Grid
function FeatureShowcase() {
  const features = [
    {
      icon: Cpu,
      title: 'Immersive DartBot',
      description: 'Train against AI with 8 difficulty levels from Novice (25 avg) to Elite (95 avg). Perfect your game with realistic opponents.',
      gradient: 'from-emerald-500 to-teal-600',
      href: '/app/play/training',
    },
    {
      icon: Users,
      title: '4-Way Around The Clock',
      description: 'Play the classic ATC game with 2-4 players online. Video verified matches with friends or random opponents.',
      gradient: 'from-indigo-500 to-violet-600',
      badge: 'Multiplayer',
      href: '/app/play/quick-match',
    },
    {
      icon: Crown,
      title: 'Ranked Divisions',
      description: 'Climb from Bronze to Grand Champion across 6 tiers. Earn RP, track your stats, and compete for seasonal rewards.',
      gradient: 'from-amber-500 to-orange-600',
      badge: 'Competitive',
      href: '/app/ranked-divisions',
    },
    {
      icon: Trophy,
      title: 'Tournaments & Leagues',
      description: 'Join weekly tournaments with up to 128 players. Create private leagues with custom rules and schedules.',
      gradient: 'from-purple-500 to-pink-600',
      href: '/app/tournaments',
    },
    {
      icon: Video,
      title: 'Video Verification',
      description: 'WebRTC-powered camera verification ensures fair play. Anti-cheat measures for competitive integrity.',
      gradient: 'from-blue-500 to-cyan-600',
      badge: 'Secure',
    },
    {
      icon: BarChart3,
      title: 'Advanced Stats',
      description: 'Track your 3-dart average, checkout percentage, win rate, and more. Filter by game mode and match type.',
      gradient: 'from-rose-500 to-orange-600',
      badge: 'Analytics',
      href: '/app/stats',
    },
  ];

  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="container mx-auto relative">
        <FadeIn className="text-center mb-16">
          <Badge className="bg-primary/10 text-primary border-primary/30 mb-4">Features</Badge>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-foreground mb-4">
            Everything You Need to
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              Master Darts
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            From casual practice to competitive tournaments, FIVE01 has it all.
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <FadeIn key={index} delay={index * 0.1}>
              <Link href={feature.href || '#'} className="block h-full group">
                <Card className="relative overflow-hidden h-full bg-slate-900/50 border-slate-700/50 p-6 hover:border-slate-500/50 transition-all duration-500 group-hover:scale-[1.02] group-hover:-translate-y-1">
                  {/* Glow Effect */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                  
                  {/* Icon */}
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 shadow-lg group-hover:shadow-xl transition-shadow`}>
                    <feature.icon className="w-7 h-7 text-white" />
                  </div>

                  {/* Badge */}
                  {feature.badge && (
                    <Badge className="absolute top-6 right-6 bg-white/10 text-white border-white/20">
                      {feature.badge}
                    </Badge>
                  )}

                  {/* Content */}
                  <h3 className="text-xl font-bold text-white mb-3 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Arrow */}
                  <div className="flex items-center gap-2 mt-6 text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0">
                    Learn more
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </Card>
              </Link>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// TRAINING MODES SECTION
function TrainingModesSection() {
  const modes = [
    { name: 'DartBot 501', icon: Cpu, desc: 'AI opponent (25-95 avg)', color: 'emerald' },
    { name: '121 Challenge', icon: Zap, desc: 'Quick checkout practice', color: 'blue' },
    { name: 'Around Clock', icon: Clock, desc: '1-20 + Bull targets', color: 'indigo' },
    { name: "Bob's 27", icon: Dices, desc: 'Doubles mastery', color: 'cyan' },
    { name: 'Finish Training', icon: Target, desc: '2-170 checkouts', color: 'orange' },
    { name: 'JDC Challenge', icon: Award, desc: 'Development routine', color: 'purple' },
    { name: 'Killer', icon: Flame, desc: 'Elimination game', color: 'rose' },
    { name: 'PDC Challenge', icon: Crown, desc: 'Pro routine', color: 'amber' },
    { name: 'Form Analysis', icon: Activity, desc: 'AI-powered feedback', color: 'slate' },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-950/50 relative overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent" />
      
      <div className="container mx-auto relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div>
            <FadeIn>
              <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 mb-4">Training Ground</Badge>
              <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
                9 Specialized
                <span className="block text-rose-400">Training Modes</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Master every aspect of your game with our comprehensive training suite. 
                From basic accuracy to professional routines used by PDC players.
              </p>
            </FadeIn>

            <FadeIn delay={0.2}>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Difficulty Levels', value: '8', icon: BarChart3 },
                  { label: 'Avg Range', value: '25-95', icon: Target },
                  { label: 'XP Rewards', value: '40-150', icon: Star },
                  { label: 'Modes', value: '9', icon: Gamepad2 },
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
                    <stat.icon className="w-5 h-5 text-rose-400 mb-2" />
                    <p className="text-2xl font-black text-white">{stat.value}</p>
                    <p className="text-muted-foreground text-sm">{stat.label}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>

          {/* Right - Mode Grid */}
          <div className="grid grid-cols-3 gap-3">
            {modes.map((mode, index) => (
              <FadeIn key={index} delay={index * 0.05}>
                <div className="group bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 hover:border-rose-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
                  <div className={`w-10 h-10 rounded-lg bg-${mode.color}-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <mode.icon className={`w-5 h-5 text-${mode.color}-400`} />
                  </div>
                  <p className="text-white font-semibold text-sm mb-1">{mode.name}</p>
                  <p className="text-muted-foreground text-xs">{mode.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// RANKED DIVISIONS SHOWCASE - Using actual rank images from Supabase
function RankedDivisionsShowcase() {
  const tiers = [
    { name: 'Bronze', divisions: 4, color: 'from-orange-700 to-amber-800', accent: 'orange', bgGlow: 'bg-orange-500/20' },
    { name: 'Silver', divisions: 4, color: 'from-slate-500 to-gray-600', accent: 'gray', bgGlow: 'bg-gray-500/20' },
    { name: 'Gold', divisions: 4, color: 'from-yellow-600 to-amber-700', accent: 'amber', bgGlow: 'bg-amber-500/20' },
    { name: 'Platinum', divisions: 4, color: 'from-cyan-600 to-blue-700', accent: 'cyan', bgGlow: 'bg-cyan-500/20' },
    { name: 'Champion', divisions: 4, color: 'from-red-600 to-rose-700', accent: 'red', bgGlow: 'bg-red-500/20' },
    { name: 'Grand Champion', divisions: 1, color: 'from-purple-600 to-violet-700', accent: 'purple', bgGlow: 'bg-purple-500/20', special: true },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-amber-500/5 to-transparent" />
      
      <div className="container mx-auto relative">
        <FadeIn className="text-center mb-16">
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 mb-4">Competitive</Badge>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-4">
            Climb the
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-red-400">
              Ranked Ladder
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            6 tiers, 21 divisions, infinite glory. Start with placement matches and work your way to Grand Champion.
          </p>
        </FadeIn>

        {/* Rank Cards Grid with Actual Images */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
          {tiers.map((tier, index) => (
            <FadeIn key={tier.name} delay={index * 0.1}>
              <div className={`relative bg-gradient-to-b ${tier.color} rounded-2xl p-1 ${tier.special ? 'ring-2 ring-amber-400/50 shadow-xl shadow-purple-500/20' : ''}`}>
                <div className="bg-slate-950/90 rounded-xl p-4 h-full">
                  {/* Rank Image from Supabase */}
                  <div className={`w-full aspect-square rounded-xl ${tier.bgGlow} flex items-center justify-center mb-3`}>
                    <RankBadge tier={tier.name} size={100} />
                  </div>
                  
                  <h3 className={`text-lg font-black text-center ${tier.special ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-purple-400' : 'text-white'}`}>
                    {tier.name}
                  </h3>
                  <p className="text-muted-foreground text-xs text-center mt-1">
                    {tier.divisions} Division{tier.divisions > 1 ? 's' : ''}
                  </p>
                  
                  {tier.special && (
                    <div className="mt-2 text-center">
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                        <Crown className="w-3 h-3 mr-1" />
                        APEX
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Current Rank Preview Card */}
        <FadeIn delay={0.6}>
          <Card className="max-w-2xl mx-auto bg-gradient-to-br from-slate-900/80 to-slate-800/80 border-slate-700/50 p-6">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <RankBadge tier="Gold" size={90} />
              </div>
              <div className="flex-1">
                <p className="text-muted-foreground text-sm">Example Progress</p>
                <h3 className="text-2xl font-black text-white">Gold Division II</h3>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div className="h-full w-2/3 bg-gradient-to-r from-amber-500 to-orange-500" />
                </div>
                <p className="text-muted-foreground text-sm mt-1">2,450 / 3,000 RP to next division</p>
              </div>
            </div>
          </Card>
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={0.7} className="text-center mt-8">
          <Link href="/app/ranked-divisions">
            <Button size="lg" className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold px-8">
              View Ranked System
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}

// 4-WAY ATC SECTION
function ATCFourWaySection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-950/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent" />
      
      <div className="container mx-auto relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Visual */}
          <FadeIn>
            <div className="relative">
              {/* Player Cards Visualization */}
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                {[
                  { name: 'Player 1', target: '15', progress: 14, color: 'emerald' },
                  { name: 'Player 2', target: '12', progress: 11, color: 'blue' },
                  { name: 'You', target: '18', progress: 17, color: 'purple', isYou: true },
                  { name: 'Player 4', target: '8', progress: 7, color: 'orange' },
                ].map((player, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={`bg-slate-900/80 border ${player.isYou ? 'border-purple-500/50 ring-2 ring-purple-500/20' : 'border-slate-700/50'} rounded-xl p-4`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-8 h-8 rounded-full bg-${player.color}-500/20 flex items-center justify-center`}>
                        <span className="text-white font-bold text-sm">{player.name[0]}</span>
                      </div>
                      <span className={`text-sm ${player.isYou ? 'text-purple-400 font-bold' : 'text-muted-foreground'}`}>
                        {player.isYou ? 'You' : player.name}
                      </span>
                      {player.isYou && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">Your Turn</span>}
                    </div>
                    <div className="text-center py-2 bg-slate-800/50 rounded-lg mb-2">
                      <span className="text-xs text-muted-foreground">Target</span>
                      <p className="text-2xl font-black text-white">{player.target}</p>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full bg-${player.color}-500`} style={{ width: `${(player.progress / 21) * 100}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-center">{player.progress}/21</p>
                  </motion.div>
                ))}
              </div>
              
              {/* Center Badge */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-indigo-500 rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/50">
                <Clock className="w-10 h-10 text-white" />
              </div>
            </div>
          </FadeIn>

          {/* Right Content */}
          <div>
            <FadeIn>
              <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 mb-4">Multiplayer</Badge>
              <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
                4-Way Around
                <span className="block text-indigo-400">The Clock</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                The classic darts game reimagined for online play. Race against up to 3 opponents 
                to hit 1-20 and the bullseye. With video verification, every match is fair and competitive.
              </p>
            </FadeIn>

            <FadeIn delay={0.2}>
              <div className="space-y-4 mb-8">
                {[
                  { icon: Users, text: '2-4 Players Online' },
                  { icon: Video, text: 'Video Verified Matches' },
                  { icon: Dices, text: '4 Segment Rules (Singles, Doubles, Trebles, Increase)' },
                  { icon: Globe, text: 'Play Friends or Matchmaking' },
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                      <feature.icon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <span className="text-white">{feature.text}</span>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={0.3}>
              <Link href="/app/play/quick-match">
                <Button size="lg" className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-bold px-8">
                  <Play className="w-5 h-5 mr-2" />
                  Play ATC Now
                </Button>
              </Link>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}

// TOURNAMENTS & LEAGUES SECTION
function TournamentsLeaguesSection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="container mx-auto">
        <FadeIn className="text-center mb-16">
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 mb-4">Community</Badge>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-4">
            Tournaments &
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              Private Leagues
            </span>
          </h2>
        </FadeIn>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Tournaments Card */}
          <FadeIn direction="left">
            <Card className="relative overflow-hidden bg-gradient-to-br from-purple-900/50 to-slate-900/50 border-purple-500/30 p-8 h-full">
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl" />
              
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6">
                  <Trophy className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-3xl font-black text-white mb-4">Tournaments</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Create or join tournaments with up to 128 players. Single or multi-day formats, 
                  customizable brackets, and real-time updates.
                </p>
                
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {['4 Players', '16 Players', '128 Players'].map((size, i) => (
                    <div key={i} className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                      <p className="text-purple-400 font-bold text-sm">{size}</p>
                    </div>
                  ))}
                </div>
                
                <Link href="/app/tournaments">
                  <Button className="bg-purple-500 hover:bg-purple-600 text-white">
                    Browse Tournaments
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </Card>
          </FadeIn>

          {/* Leagues Card */}
          <FadeIn direction="right">
            <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-900/50 to-slate-900/50 border-emerald-500/30 p-8 h-full">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl" />
              
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mb-6">
                  <Users className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-3xl font-black text-white mb-4">Private Leagues</h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Create your own league with custom rules, weekly matches, and private leaderboards. 
                  Perfect for friend groups, pubs, or local clubs.
                </p>
                
                <div className="space-y-3 mb-8">
                  {['Weekly Fixtures', 'Custom Rules', 'Private Leaderboard'].map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                      <span className="text-white">{feature}</span>
                    </div>
                  ))}
                </div>
                
                <Link href="/app/leagues">
                  <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                    Create League
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </Card>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// DARTBOT SHOWCASE
function DartbotShowcase() {
  const difficulties = [
    { level: 1, label: 'Novice', avg: 25 },
    { level: 3, label: 'Casual', avg: 45 },
    { level: 5, label: 'Advanced', avg: 65 },
    { level: 7, label: 'Pro', avg: 85 },
    { level: 8, label: 'Elite', avg: 95 },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-950/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
      
      <div className="container mx-auto relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div>
            <FadeIn>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 mb-4">AI Training</Badge>
              <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
                Meet Your
                <span className="block text-emerald-400">Perfect Opponent</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Our AI DartBot adapts to your skill level with 8 difficulty settings. 
                Practice against opponents ranging from 25 to 95 average — 
                equivalent to beginner pub players to professional champions.
              </p>
            </FadeIn>

            <FadeIn delay={0.2}>
              <div className="space-y-4">
                <h4 className="text-white font-bold mb-4">Difficulty Levels</h4>
                <div className="flex flex-wrap gap-3">
                  {difficulties.map((diff) => (
                    <div key={diff.level} className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-2">
                      <span className="text-emerald-400 font-bold">{diff.label}</span>
                      <span className="text-muted-foreground text-sm ml-2">{diff.avg} avg</span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={0.3} className="mt-8">
              <Link href="/app/play/training">
                <Button size="lg" className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold px-8">
                  <Cpu className="w-5 h-5 mr-2" />
                  Train with DartBot
                </Button>
              </Link>
            </FadeIn>
          </div>

          {/* Right - Visual */}
          <FadeIn delay={0.2}>
            <div className="relative">
              <Card className="bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border-emerald-500/30 p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-xl">
                    <Cpu className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white">DartBot</h3>
                    <p className="text-emerald-400">AI Opponent</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-white">8</p>
                    <p className="text-muted-foreground text-sm">Levels</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-emerald-400">25-95</p>
                    <p className="text-muted-foreground text-sm">Avg Range</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Current Setting</span>
                    <span className="text-white font-bold">Level 4 - Intermediate</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-1/2 bg-gradient-to-r from-emerald-500 to-teal-500" />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Badge className="bg-emerald-500/20 text-emerald-400">301</Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-400">501</Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-400">Best of 3/5/7</Badge>
                </div>
              </Card>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// STATS TRACKING SECTION - New comprehensive section
function StatsTrackingSection() {
  const statsFeatures = [
    { icon: Target, label: '3-Dart Average', desc: 'Track your scoring consistency' },
    { icon: BarChart3, label: 'Checkout %', desc: 'Master your finishing' },
    { icon: Flame, label: '180s & High Scores', desc: 'Celebrate your best throws' },
    { icon: TrendingUp, label: 'Win Rate', desc: 'Monitor your improvement' },
    { icon: PieChart, label: 'Score Distribution', desc: 'Visualize your performance' },
    { icon: Filter, label: 'Filter by Mode', desc: '301, 501, Ranked, Quick Match' },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-rose-500/5 to-transparent" />
      
      <div className="container mx-auto relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Visual Preview */}
          <FadeIn>
            <Card className="bg-slate-900/80 border-slate-700/50 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl" />
              
              {/* Stats Preview Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-black text-white">Your Stats</h3>
                  <p className="text-muted-foreground text-sm">Last 30 Days</p>
                </div>
                <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">
                  <BarChart3 className="w-3 h-3 mr-1" />
                  Pro Stats
                </Badge>
              </div>

              {/* Main Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                  { value: '68.4', label: '3-Dart Avg', trend: '+2.3', positive: true },
                  { value: '42%', label: 'Checkout %', trend: '+5%', positive: true },
                  { value: '47', label: '180s', trend: '+12', positive: true },
                  { value: '156', label: 'Matches', trend: 'W: 89 L: 67', positive: null },
                ].map((stat, i) => (
                  <div key={i} className="bg-slate-800/50 rounded-xl p-4">
                    <p className="text-2xl font-black text-white">{stat.value}</p>
                    <p className="text-muted-foreground text-xs">{stat.label}</p>
                    {stat.trend && (
                      <p className={`text-xs mt-1 ${stat.positive === true ? 'text-emerald-400' : stat.positive === false ? 'text-red-400' : 'text-blue-400'}`}>
                        {stat.positive === true && '+'}{stat.trend}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Chart Preview */}
              <div className="bg-slate-800/30 rounded-xl p-4">
                <p className="text-muted-foreground text-xs mb-3">Average Trend</p>
                <div className="flex items-end gap-1 h-24">
                  {[45, 52, 48, 58, 55, 62, 59, 65, 63, 68, 66, 70].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-rose-500 to-rose-400/50 rounded-t"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Jan</span>
                  <span>Dec</span>
                </div>
              </div>
            </Card>
          </FadeIn>

          {/* Right Content */}
          <div>
            <FadeIn>
              <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 mb-4">Analytics</Badge>
              <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
                Track Every
                <span className="block text-rose-400">Throw</span>
              </h2>
              <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                Comprehensive statistics to help you understand and improve your game. 
                Filter by game mode, match type, and time period to dive deep into your performance.
              </p>
            </FadeIn>

            <FadeIn delay={0.2}>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {statsFeatures.map((feature, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-rose-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <feature.icon className="w-5 h-5 text-rose-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{feature.label}</p>
                      <p className="text-muted-foreground text-xs">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>

            <FadeIn delay={0.3}>
              <Link href="/app/stats">
                <Button size="lg" className="bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-600 hover:to-orange-700 text-white font-bold px-8">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  View Your Stats
                </Button>
              </Link>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}

// VIDEO VERIFICATION SECTION
function VideoVerificationSection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-950/50 relative overflow-hidden">
      <div className="container mx-auto">
        <div className="max-w-4xl mx-auto text-center">
          <FadeIn>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 mb-4">Fair Play</Badge>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
              Video Verified
              <span className="block text-blue-400">Competition</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
              Every ranked match is verified with WebRTC camera streaming. 
              Our anti-cheat system ensures fair play and competitive integrity.
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Video, title: 'Live Camera', desc: 'WebRTC streaming during matches' },
                { icon: Shield, title: 'Anti-Cheat', desc: 'Automated fairness detection' },
                { icon: Lock, title: 'Secure', desc: 'End-to-end encrypted streams' },
              ].map((item, i) => (
                <Card key={i} className="bg-slate-900/50 border-slate-700/50 p-6">
                  <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-7 h-7 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-muted-foreground text-sm">{item.desc}</p>
                </Card>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// ACHIEVEMENTS PREVIEW
function AchievementsPreview() {
  const achievements = [
    { icon: Trophy, name: 'First Win', desc: 'Win your first match', rarity: 'common' },
    { icon: Flame, name: 'On Fire', desc: 'Win 5 matches in a row', rarity: 'rare' },
    { icon: Crown, name: 'Champion', desc: 'Reach Champion tier', rarity: 'epic' },
    { icon: Star, name: 'Perfect Game', desc: '9-dart finish', rarity: 'legendary' },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="container mx-auto">
        <FadeIn className="text-center mb-12">
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 mb-4">Achievements</Badge>
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
            50+ Achievements to
            <span className="block text-yellow-400">Unlock</span>
          </h2>
        </FadeIn>

        <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {achievements.map((ach, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 text-center hover:border-yellow-500/30 transition-colors group">
                <div className="w-16 h-16 bg-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <ach.icon className="w-8 h-8 text-yellow-400" />
                </div>
                <h3 className="text-white font-bold mb-1">{ach.name}</h3>
                <p className="text-muted-foreground text-sm">{ach.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.4} className="text-center mt-8">
          <p className="text-muted-foreground">And 46 more across Ranked, League, Tournament, and Practice modes!</p>
        </FadeIn>
      </div>
    </section>
  );
}

// SOCIAL PROOF SECTION
function SocialProofSection() {
  const stats = [
    { value: '12,000+', label: 'Active Players', icon: Users },
    { value: '500K+', label: 'Matches Played', icon: Trophy },
    { value: '45+', label: 'Countries', icon: Globe },
    { value: '4.8', label: 'App Rating', icon: Star },
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 border-y border-border/50">
      <div className="container mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <FadeIn key={index} delay={index * 0.1}>
              <div className="text-center">
                <stat.icon className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="text-4xl font-black text-white mb-1">{stat.value}</p>
                <p className="text-muted-foreground">{stat.label}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// TESTIMONIALS
function Testimonials() {
  const testimonials = [
    {
      quote: "The DartBot training has improved my average by 20 points in just 2 months. The AI feels incredibly realistic!",
      author: "Michael R.",
      role: "Gold Division",
      rating: 5,
    },
    {
      quote: "Finally a platform that takes online darts seriously. Video verification gives me confidence that matches are fair.",
      author: "Sarah K.",
      role: "Diamond Division",
      rating: 5,
    },
    {
      quote: "4-way ATC with friends is an absolute blast. We play every weekend now. The video feature makes it feel like we're in the same room.",
      author: "James L.",
      role: "Platinum Division",
      rating: 5,
    },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-950/50">
      <div className="container mx-auto">
        <FadeIn className="text-center mb-16">
          <h2 className="text-4xl font-black text-white mb-4">What Players Say</h2>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <FadeIn key={index} delay={index * 0.15}>
              <Card className="bg-slate-900/50 border-slate-700/50 p-6 h-full">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed italic">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                    {testimonial.author[0]}
                  </div>
                  <div>
                    <p className="text-white font-semibold">{testimonial.author}</p>
                    <p className="text-primary text-sm">{testimonial.role}</p>
                  </div>
                </div>
              </Card>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// FAQ SECTION
function FAQ() {
  const faqs = [
    {
      question: 'What equipment do I need?',
      answer: 'You need a regulation dartboard, a device with a camera (smartphone, tablet, or computer), and an internet connection. Our app works on iOS, Android, and web browsers.',
    },
    {
      question: 'How does video verification work?',
      answer: 'During ranked matches, your camera streams via WebRTC to ensure fair play. Our system verifies both players are playing legitimately. Streams are encrypted and only used for anti-cheat purposes.',
    },
    {
      question: 'Can I play on mobile?',
      answer: 'Yes! FIVE01 is fully optimized for mobile devices. You can track scores, view stats, and even use your phone camera for video verification.',
    },
    {
      question: 'What training modes are available?',
      answer: 'We offer 9 training modes: DartBot (AI opponent), 121 Challenge, Around the Clock, Bob\'s 27, Finish Training (2-170), JDC Challenge, Killer, PDC Challenge, and Form Analysis with AI feedback.',
    },
    {
      question: 'How do ranked divisions work?',
      answer: 'Start with 10 placement matches to get your initial rank. Then earn or lose Ranking Points (RP) based on match results. Climb from Bronze through Silver, Gold, Platinum, Champion to Grand Champion.',
    },
    {
      question: 'What stats can I track?',
      answer: 'Track your 3-dart average, checkout percentage, win rate, 180s count, score distribution, and more. Filter stats by game mode (301/501), match type (Ranked/Quick/Private), and time period.',
    },
  ];

  return (
    <section id="faq" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-3xl">
        <FadeIn className="text-center mb-12">
          <Badge className="bg-primary/10 text-primary border-primary/30 mb-4">FAQ</Badge>
          <h2 className="text-4xl font-black text-white mb-4">Frequently Asked Questions</h2>
        </FadeIn>

        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((faq, index) => (
            <FadeIn key={index} delay={index * 0.05}>
              <AccordionItem
                value={`item-${index}`}
                className="bg-slate-900/50 border border-slate-700/50 rounded-2xl px-6 data-[state=open]:border-primary/50"
              >
                <AccordionTrigger className="text-white hover:text-primary text-left text-lg font-semibold py-6 hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-6 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            </FadeIn>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// FINAL CTA
function FinalCTA() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-secondary/20 rounded-full blur-[100px]" />
      
      <div className="container mx-auto relative">
        <div className="max-w-3xl mx-auto text-center">
          <FadeIn>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6">
              Ready to Throw?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto">
              Join 12,000+ players already competing on FIVE01. 
              Create your account and start playing in minutes.
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-bold text-lg px-10 h-14 shadow-xl shadow-primary/30">
                  <Play className="w-5 h-5 mr-2" />
                  Create Free Account
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="border-2 border-slate-600 text-white hover:bg-white/5 font-bold text-lg px-10 h-14">
                  Sign In
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={0.3} className="mt-8">
            <p className="text-muted-foreground text-sm">
              No credit card required to start playing
            </p>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// FOOTER
function Footer({ scrollToSection }: any) {
  return (
    <footer className="bg-slate-950 border-t border-white/5 py-12 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black text-white">FIVE01</span>
            </div>
            <p className="text-muted-foreground text-sm">The ultimate online darts platform. Train, compete, and master your game.</p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Play</h4>
            <ul className="space-y-2">
              <li><Link href="/app/play/training" className="text-muted-foreground hover:text-primary transition-colors text-sm">Training</Link></li>
              <li><Link href="/app/play/quick-match" className="text-muted-foreground hover:text-primary transition-colors text-sm">Quick Match</Link></li>
              <li><Link href="/app/ranked" className="text-muted-foreground hover:text-primary transition-colors text-sm">Ranked</Link></li>
              <li><Link href="/app/tournaments" className="text-muted-foreground hover:text-primary transition-colors text-sm">Tournaments</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Learn</h4>
            <ul className="space-y-2">
              <li><button onClick={() => scrollToSection('features')} className="text-muted-foreground hover:text-primary transition-colors text-sm">Features</button></li>
              <li><button onClick={() => scrollToSection('faq')} className="text-muted-foreground hover:text-primary transition-colors text-sm">FAQ</button></li>
              <li><Link href="/app/stats" className="text-muted-foreground hover:text-primary transition-colors text-sm">Stats</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Connect</h4>
            <div className="flex space-x-3">
              {[Twitter, Instagram, Youtube, Facebook].map((Icon, index) => (
                <button
                  key={index}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all hover:scale-110 text-muted-foreground hover:text-primary"
                >
                  <Icon className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">© 2026 FIVE01. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-muted-foreground hover:text-white text-sm transition-colors">Privacy</Link>
            <Link href="/terms" className="text-muted-foreground hover:text-white text-sm transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

'use client';

import Link from 'next/link';
import Image from 'next/image';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TopNav } from '@/components/website/TopNav';

export default function Home() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav scrollToSection={scrollToSection} />

      <main>
        <HeroSection scrollToSection={scrollToSection} />
        <FeatureTiles />
        <HowItWorks />
        <StatsPreview />
        <Community />
        <Pricing />
        <FAQ />
        <FinalCTA scrollToSection={scrollToSection} />
      </main>

      <Footer scrollToSection={scrollToSection} />
    </div>
  );
}

function HeroSection({ scrollToSection }: any) {
  return (
    <section id="home" className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <span className="text-primary font-semibold text-sm">SEASON LIVE</span>
            </div>

            <div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold font-display text-foreground leading-tight mb-6">
                FIVE01<br />
                <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
                  Online Darts League
                </span>
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Compete in weekly matches, track stats, earn rankings, and win prizes — all online.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold text-lg px-8 h-14 shadow-lg shadow-primary/20"
                >
                  Join Now
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="border-2 font-semibold text-lg px-8 h-14"
                onClick={() => scrollToSection('how-it-works')}
              >
                Watch How It Works
              </Button>
            </div>
          </div>

          <div className="relative">
            <Card className="p-8 bg-card/90 backdrop-blur-xl border shadow-2xl">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Player Rating</p>
                    <p className="text-4xl font-bold text-white">1847</p>
                  </div>
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-primary-foreground" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                    <p className="text-green-400 text-sm font-semibold">Wins</p>
                    <p className="text-2xl font-bold text-white">24</p>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <p className="text-red-400 text-sm font-semibold">Losses</p>
                    <p className="text-2xl font-bold text-white">8</p>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                  <p className="text-gray-400 text-sm mb-2">Current Division</p>
                  <p className="text-xl font-bold text-primary">Elite Division</p>
                </div>

                <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-xl p-4">
                  <p className="text-gray-300 text-sm mb-2">Next Match</p>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-bold text-white">2d 14h 32m</p>
                    <Target className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </div>
            </Card>

            <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/20 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-secondary/20 rounded-full blur-3xl"></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureTiles() {
  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="group cursor-pointer">
            <Card className="h-full bg-gradient-to-br from-red-600 to-orange-600 border-0 p-8 hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-orange-500/50">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <Target className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white">Play Local</h3>
                <p className="text-white/90">
                  Create leagues with friends at home or your local venue.
                </p>
              </div>
            </Card>
          </div>

          <div className="group cursor-pointer">
            <Card className="h-full bg-gradient-to-br from-orange-600 to-orange-500 border-0 p-8 hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-orange-400/50">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <Globe className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white">Play Online</h3>
                <p className="text-white/90">
                  Find opponents worldwide and play ranked matches anytime.
                </p>
              </div>
            </Card>
          </div>

          <div className="group cursor-pointer">
            <Card className="h-full bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 p-8 hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/30">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white">Online Tournaments</h3>
                <p className="text-gray-300">
                  Join weekly tournaments and seasonal finals.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold font-display text-foreground mb-4">How FIVE01 Works</h2>
          <p className="text-xl text-muted-foreground">Get started in four simple steps</p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-12">
          {[
            { icon: User, title: 'Create Your Profile', desc: 'Sign up and set up your player profile with your stats and preferences.' },
            { icon: Award, title: 'Join a Division', desc: 'Get placed in a division based on your skill level and rating.' },
            { icon: Target, title: 'Play Weekly Matches', desc: 'Compete against opponents in your division every week.' },
            { icon: TrendingUp, title: 'Climb Rankings & Win', desc: 'Earn points, climb the leaderboard, and win prizes.' },
          ].map((step, index) => (
            <Card key={index} className="bg-card/50 backdrop-blur-sm border p-6 hover:border-primary transition-all">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center">
                    <step.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-5xl font-bold text-white/10">{index + 1}</span>
                </div>
                <h3 className="text-xl font-bold text-white">{step.title}</h3>
                <p className="text-gray-400">{step.desc}</p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 backdrop-blur-sm border border-white/10 p-8">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">Season Timeline</h3>
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { label: 'Pre-season Signup', weeks: 'Week 0' },
              { label: 'Regular Matches', weeks: 'Weeks 1-10' },
              { label: 'Playoffs', weeks: 'Weeks 11-12' },
              { label: 'Champion Crowned', weeks: 'Finals' },
            ].map((phase, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-white font-bold">{index + 1}</span>
                </div>
                <p className="text-white font-semibold mb-1">{phase.label}</p>
                <p className="text-gray-400 text-sm">{phase.weeks}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function StatsPreview() {
  const leaderboardData = [
    { rank: 1, name: 'TheDartMaster', rating: 2156, wins: 48, avg180s: 3.2, checkout: 42 },
    { rank: 2, name: 'BullseyeKing', rating: 2089, wins: 45, avg180s: 2.8, checkout: 39 },
    { rank: 3, name: 'TripleShot', rating: 2034, wins: 42, avg180s: 2.5, checkout: 41 },
    { rank: 4, name: 'DartNinja', rating: 1998, wins: 40, avg180s: 2.3, checkout: 38 },
    { rank: 5, name: 'AcePlayer', rating: 1956, wins: 38, avg180s: 2.1, checkout: 36 },
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-950/50">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">Track Stats Like a Pro</h2>
          <p className="text-xl text-gray-400">Advanced analytics and performance tracking</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="bg-slate-900/50 backdrop-blur-sm border border-white/10 overflow-hidden">
            <div className="p-6">
              <h3 className="text-2xl font-bold text-white mb-6">Live Leaderboard</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-2 text-gray-400 font-semibold text-sm">Rank</th>
                      <th className="text-left py-3 px-2 text-gray-400 font-semibold text-sm">Player</th>
                      <th className="text-left py-3 px-2 text-gray-400 font-semibold text-sm">Rating</th>
                      <th className="text-left py-3 px-2 text-gray-400 font-semibold text-sm">Wins</th>
                      <th className="text-left py-3 px-2 text-gray-400 font-semibold text-sm">180s</th>
                      <th className="text-left py-3 px-2 text-gray-400 font-semibold text-sm">CO%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardData.map((player) => (
                      <tr key={player.rank} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-4 px-2">
                          <span className={`font-bold ${player.rank <= 3 ? 'text-orange-400' : 'text-white'}`}>
                            #{player.rank}
                          </span>
                        </td>
                        <td className="py-4 px-2 text-white font-medium">{player.name}</td>
                        <td className="py-4 px-2 text-cyan-400 font-bold">{player.rating}</td>
                        <td className="py-4 px-2 text-green-400">{player.wins}</td>
                        <td className="py-4 px-2 text-gray-300">{player.avg180s}</td>
                        <td className="py-4 px-2 text-gray-300">{player.checkout}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm border border-white/10 p-8">
            <h3 className="text-2xl font-bold text-white mb-6">Your Season Progress</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">ELO Rating</span>
                  <span className="text-2xl font-bold text-orange-400">1847</span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-3/4 bg-gradient-to-r from-orange-500 to-red-500"></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                  <p className="text-gray-400 text-sm mb-1">Match History</p>
                  <p className="text-3xl font-bold text-white">32</p>
                  <p className="text-green-400 text-sm">24W - 8L</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                  <p className="text-gray-400 text-sm mb-1">Average Score</p>
                  <p className="text-3xl font-bold text-white">68.4</p>
                  <p className="text-cyan-400 text-sm">+2.3 this week</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-white/5">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-orange-400" />
                    <span className="text-white font-medium">180s Thrown</span>
                  </div>
                  <span className="text-orange-400 font-bold">47</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-white/5">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-orange-400" />
                    <span className="text-white font-medium">Checkout %</span>
                  </div>
                  <span className="text-orange-400 font-bold">38.2%</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-white/5">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-orange-400" />
                    <span className="text-white font-medium">Highest Checkout</span>
                  </div>
                  <span className="text-orange-400 font-bold">164</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Community() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm border border-white/10 p-12 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">Join the FIVE01 Community</h2>
          <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
            Highlights, player clips, rankings updates and tournament streams.
          </p>

          <div className="flex flex-wrap justify-center gap-6">
            {[
              { Icon: Instagram, color: 'hover:text-pink-400' },
              { Icon: Youtube, color: 'hover:text-red-500' },
              { Icon: Facebook, color: 'hover:text-blue-500' },
              { Icon: Twitter, color: 'hover:text-cyan-400' },
              { Icon: MessageCircle, color: 'hover:text-purple-400' },
            ].map(({ Icon, color }, index) => (
              <button
                key={index}
                className={`w-16 h-16 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center transition-all hover:scale-110 text-gray-400 ${color}`}
              >
                <Icon className="w-8 h-8" />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: ['Join leagues', 'Basic stats', 'Weekly matches', 'Community access'],
      cta: 'Get Started',
      highlight: false,
    },
    {
      name: 'Pro',
      price: '$9',
      period: 'per month',
      features: ['Advanced stats', 'Ranked matchmaking', 'Season badges', 'Priority support', 'Match replays'],
      cta: 'Upgrade to Pro',
      highlight: false,
    },
    {
      name: 'Elite',
      price: '$19',
      period: 'per month',
      badge: 'MOST POPULAR',
      features: ['Tournament priority', 'Prize eligibility', 'Exclusive leagues', 'Pro features', 'Personal coach', 'Ad-free experience'],
      cta: 'Join Elite',
      highlight: true,
    },
  ];

  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-950/50">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">Choose Your Plan</h2>
          <p className="text-xl text-gray-400">Start free, upgrade when you're ready</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card
              key={index}
              className={`relative p-8 ${
                plan.highlight
                  ? 'bg-gradient-to-br from-orange-600/20 to-red-600/20 border-2 border-orange-500 scale-105'
                  : 'bg-slate-900/50 border border-white/10'
              } backdrop-blur-sm hover:scale-105 transition-all duration-300`}
            >
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-1 rounded-full">
                    <span className="text-white text-sm font-bold">{plan.badge}</span>
                  </div>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-4">{plan.name}</h3>
                <div className="mb-2">
                  <span className="text-5xl font-bold text-white">{plan.price}</span>
                </div>
                <p className="text-gray-400">{plan.period}</p>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href="/signup" className="w-full">
                <Button
                  className={`w-full ${
                    plan.highlight
                      ? 'bg-gradient-to-r from-primary to-secondary hover:opacity-90'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  } font-semibold`}
                >
                  {plan.cta}
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    {
      question: 'What equipment do I need?',
      answer: 'You need a regulation dartboard, a smartphone or tablet with a camera for score tracking, and an internet connection. Our app works with iOS and Android devices.',
    },
    {
      question: 'Can I play on mobile?',
      answer: 'Yes! FIVE01 is fully optimized for mobile devices. You can track scores, view stats, and manage your profile from your smartphone or tablet.',
    },
    {
      question: 'How do matches work?',
      answer: 'Matches are scheduled weekly within your division. You play against assigned opponents and submit scores through our app. Match results are verified and rankings are updated automatically.',
    },
    {
      question: 'What formats do you support (501/301)?',
      answer: 'We support all major darts formats including 501, 301, and Around the Clock. You can also create custom formats for private leagues.',
    },
    {
      question: 'Can I create a private league?',
      answer: 'Absolutely! You can create private leagues for your friends, local pub, or darts club. Set custom rules, schedules, and invite players directly.',
    },
    {
      question: 'Are there prizes?',
      answer: 'Yes! Elite members are eligible for prize pools in seasonal tournaments. We also offer badges, trophies, and recognition for top performers across all membership tiers.',
    },
  ];

  return (
    <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-3xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">Frequently Asked Questions</h2>
          <p className="text-xl text-gray-400">Everything you need to know about FIVE01</p>
        </div>

        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-2xl px-6 data-[state=open]:border-orange-500/50"
            >
              <AccordionTrigger className="text-white hover:text-orange-400 text-left text-lg font-semibold py-6 hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-gray-300 pb-6">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function FinalCTA({ scrollToSection }: any) {
  return (
    <section id="contact" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-950/50">
      <div className="container mx-auto">
        <Card className="bg-gradient-to-r from-orange-600 to-red-600 border-0 p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20"></div>

          <div className="relative z-10">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">Ready to Join FIVE01?</h2>
            <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
              Start competing today and climb the leaderboard.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="bg-white text-primary hover:bg-gray-100 font-semibold text-lg px-8 h-14">
                  Join Now
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white/10 font-semibold text-lg px-8 h-14" onClick={() => scrollToSection('contact')}>
                Contact Us
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function Footer({ scrollToSection }: any) {
  return (
    <footer className="bg-slate-950 border-t border-white/5 py-12 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center mb-4">
              <Image 
                src="/logo.png" 
                alt="FIVE01" 
                width={180} 
                height={60} 
                className="h-15 w-auto object-contain"
              />
            </div>
            <p className="text-gray-400">The ultimate online darts league.</p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><button onClick={() => scrollToSection('home')} className="text-gray-400 hover:text-orange-400 transition-colors">Home</button></li>
              <li><button onClick={() => scrollToSection('how-it-works')} className="text-gray-400 hover:text-orange-400 transition-colors">How It Works</button></li>
              <li><button onClick={() => scrollToSection('features')} className="text-gray-400 hover:text-orange-400 transition-colors">Features</button></li>
              <li><button onClick={() => scrollToSection('pricing')} className="text-gray-400 hover:text-orange-400 transition-colors">Pricing</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Contact</h4>
            <p className="text-gray-400">hello@five01.com</p>
            <p className="text-gray-400 mt-2">support@five01.com</p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Follow Us</h4>
            <div className="flex space-x-3">
              {[Instagram, Youtube, Facebook, Twitter].map((Icon, index) => (
                <button
                  key={index}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center transition-all hover:scale-110 text-gray-400 hover:text-orange-400"
                >
                  <Icon className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 text-center">
          <p className="text-gray-400">© 2026 FIVE01. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

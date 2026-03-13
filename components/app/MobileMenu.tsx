'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Play,
  Trophy,
  TrendingUp,
  Users,
  User,
  Settings,
  LogOut,
  X,
  Award,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfile } from '@/lib/context/ProfileContext';
import { createClient } from '@/lib/supabase/client';

const navLinks = [
  { href: '/app', label: 'Dashboard', icon: Home },
  { href: '/app/play', label: 'Play', icon: Play },
  { href: '/app/ranked-divisions', label: 'Ranked Divisions', icon: Award },
  { href: '/app/leagues', label: 'Leagues (Soon)', icon: Users, locked: true },
  { href: '/app/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/app/stats', label: 'Stats', icon: TrendingUp },
];

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useProfile();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onClose();
    router.push('/login');
  };

  const getInitials = () => {
    if (profile?.display_name) {
      return profile.display_name.substring(0, 2).toUpperCase();
    }
    if (profile?.username) {
      return profile.username.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-80 bg-slate-900/95 backdrop-blur-xl border-white/10 p-0"
      >
        <SheetHeader className="border-b border-white/10 p-6">
          <div className="flex items-center space-x-3">
            <Avatar className="w-12 h-12">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="text-sm font-medium text-white">
                {profile?.display_name || profile?.username || 'User'}
              </p>
              <p className="text-xs text-gray-400">@{profile?.username || 'user'}</p>
            </div>
          </div>
        </SheetHeader>

        <nav className="p-4 space-y-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            const locked = (link as any).locked;

            if (locked) {
              return (
                <Button
                  key={link.href}
                  variant="ghost"
                  disabled
                  className="w-full justify-start text-slate-500 opacity-50 cursor-not-allowed"
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {link.label}
                </Button>
              );
            }

            return (
              <Link key={link.href} href={link.href} onClick={onClose}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start ${
                    isActive
                      ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {link.label}
                </Button>
              </Link>
            );
          })}

          <div className="pt-4 border-t border-white/10 space-y-2">
            <Link href="/app/profile" onClick={onClose}>
              <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/5">
                <User className="w-5 h-5 mr-3" />
                Profile
              </Button>
            </Link>

            <Link href="/app/friends" onClick={onClose}>
              <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/5">
                <UserPlus className="w-5 h-5 mr-3" />
                Friends
              </Button>
            </Link>

            <Link href="/app/settings" onClick={onClose}>
              <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/5">
                <Settings className="w-5 h-5 mr-3" />
                Settings
              </Button>
            </Link>

            <Button
              variant="ghost"
              className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5 mr-3" />
              Log out
            </Button>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

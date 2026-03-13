'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Home,
  Play,
  Trophy,
  TrendingUp,
  Users,
  Search,
  Bell,
  User,
  Settings,
  LogOut,
  Menu,
  Award,
  UserPlus,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
// Input no longer needed - GlobalSearch handles it
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MobileMenu } from './MobileMenu';
import { NotificationDropdown } from './NotificationDropdown';
import { GlobalSearch } from './GlobalSearch';
import { useNotifications } from '@/lib/context/NotificationsContext';
import { useProfile } from '@/lib/context/ProfileContext';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navLinks = [
  { href: '/app', label: 'Dashboard', icon: Home },
  { href: '/app/play', label: 'Play', icon: Play },
  { href: '/app/ranked-divisions', label: 'Ranked Divisions', icon: Award },
  { href: '#', label: 'Leagues', icon: Users, locked: true },
  { href: '/app/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/app/stats', label: 'Stats', icon: TrendingUp },
];

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const { profile } = useProfile();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/40 backdrop-blur-xl border-b border-white/10">
        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2 sm:space-x-6 min-w-0">
              <Link href="/app" className="flex items-center">
                <Image 
                  src="/logo.png" 
                  alt="FIVE01" 
                  width={240} 
                  height={216} 
                  className="h-14 sm:h-24 w-auto object-contain"
                  priority
                />
              </Link>

              <div className="hidden lg:flex items-center">
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse mr-1.5" />
                  SEASON LIVE
                </Badge>
              </div>
            </div>

            <nav className="hidden lg:flex items-center space-x-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;

                if (link.locked) {
                  return (
                    <div key={link.label} className="relative group">
                      <Button
                        variant="ghost"
                        disabled
                        className="relative px-4 py-2 text-gray-500 cursor-not-allowed opacity-50"
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        {link.label}
                        <Lock className="w-3 h-3 ml-1" />
                      </Button>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Coming Soon
                      </div>
                    </div>
                  );
                }

                return (
                  <Link key={link.href} href={link.href}>
                    <Button
                      variant="ghost"
                      className={`relative px-4 py-2 ${
                        isActive
                          ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                          : 'text-gray-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {link.label}
                      {isActive && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-400 rounded-full" />
                      )}
                    </Button>
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center space-x-1.5 sm:space-x-3">
              <div className="hidden md:flex items-center">
                <GlobalSearch className="w-64" />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-gray-300 hover:text-white hover:bg-white/5"
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <Search className="w-5 h-5" />
              </Button>

              <NotificationDropdown>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative text-gray-300 hover:text-white hover:bg-white/5"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-emerald-400 text-slate-900 text-[10px] font-bold rounded-full px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Button>
              </NotificationDropdown>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full hover:bg-white/5"
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-sm">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-1rem)] bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
                  {/* Header - Dashboard Style */}
                  <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/30">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={profile?.avatar_url || ''} />
                        <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-sm">
                          {getInitials()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-bold text-white">
                          {profile?.display_name || profile?.username || 'User'}
                        </p>
                        <p className="text-xs text-slate-400">@{profile?.username || 'user'}</p>
                      </div>
                    </div>
                  </div>
                  {/* Menu Items - Dashboard Style */}
                  <div className="p-1.5">
                    <DropdownMenuItem asChild className="text-slate-300 hover:text-emerald-400 hover:bg-slate-700/50 cursor-pointer rounded-lg focus:bg-slate-700/50 focus:text-emerald-400 transition-colors">
                      <Link href="/app/profile" className="flex items-center gap-3">
                        <User className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="text-slate-300 hover:text-emerald-400 hover:bg-slate-700/50 cursor-pointer rounded-lg focus:bg-slate-700/50 focus:text-emerald-400 transition-colors">
                      <Link href="/app/achievements" className="flex items-center gap-3">
                        <Award className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
                        Achievements
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="text-slate-300 hover:text-emerald-400 hover:bg-slate-700/50 cursor-pointer rounded-lg focus:bg-slate-700/50 focus:text-emerald-400 transition-colors">
                      <Link href="/app/friends" className="flex items-center gap-3">
                        <UserPlus className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
                        Friends
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="text-slate-300 hover:text-emerald-400 hover:bg-slate-700/50 cursor-pointer rounded-lg focus:bg-slate-700/50 focus:text-emerald-400 transition-colors">
                      <Link href="/app/settings" className="flex items-center gap-3">
                        <Settings className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-slate-700/50 my-1.5" />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/20 cursor-pointer rounded-lg focus:bg-red-500/20 focus:text-red-300 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <LogOut className="w-4 h-4" />
                        Log out
                      </div>
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-gray-300 hover:text-white hover:bg-white/5"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {searchOpen && (
            <div className="md:hidden pb-4">
              <GlobalSearch 
                className="w-full" 
                onNavigate={() => setSearchOpen(false)} 
              />
            </div>
          )}
        </div>
      </header>

      <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </>
  );
}

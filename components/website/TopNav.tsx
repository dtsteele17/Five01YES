'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WebsiteMobileMenu } from './WebsiteMobileMenu';

interface TopNavProps {
  scrollToSection: (id: string) => void;
}

export function TopNav({ scrollToSection }: TopNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', target: 'home' },
    { label: 'How It Works', target: 'how-it-works' },
    { label: 'Features', target: 'features' },
    { label: 'Pricing', target: 'pricing' },
    { label: 'FAQ', target: 'faq' },
    { label: 'Contact', target: 'contact' },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/40 backdrop-blur-xl border-b border-white/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center">
              <Image 
                src="/logo.png" 
                alt="FIVE01" 
                width={180} 
                height={60} 
                className="h-15 w-auto object-contain"
                priority
              />
            </Link>

            <nav className="hidden lg:flex items-center space-x-1">
              {navLinks.map((link) => (
                <Button
                  key={link.target}
                  variant="ghost"
                  onClick={() => scrollToSection(link.target)}
                  className="text-gray-300 hover:text-white hover:bg-white/5 px-4 py-2"
                >
                  {link.label}
                </Button>
              ))}
            </nav>

            <div className="hidden lg:flex items-center space-x-3">
              <Link href="/login">
                <Button variant="ghost" className="text-white hover:bg-white/5">
                  Log In
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white font-semibold">
                  Join League
                </Button>
              </Link>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-white hover:bg-white/5"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <WebsiteMobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        scrollToSection={scrollToSection}
      />
    </>
  );
}

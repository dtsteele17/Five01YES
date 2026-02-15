'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface WebsiteMobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  scrollToSection: (id: string) => void;
}

export function WebsiteMobileMenu({ isOpen, onClose, scrollToSection }: WebsiteMobileMenuProps) {
  const navLinks = [
    { label: 'Home', target: 'home' },
    { label: 'How It Works', target: 'how-it-works' },
    { label: 'Features', target: 'features' },
    { label: 'Pricing', target: 'pricing' },
    { label: 'FAQ', target: 'faq' },
    { label: 'Contact', target: 'contact' },
  ];

  const handleNavClick = (target: string) => {
    scrollToSection(target);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-80 bg-slate-900/95 backdrop-blur-xl border-white/10 p-0"
      >
        <SheetHeader className="border-b border-white/10 p-6">
          <div className="flex items-center">
            <Image 
              src="/logo.png" 
              alt="FIVE01" 
              width={100} 
                height={90} 
                className="h-10 w-auto object-contain"
              priority
            />
          </div>
        </SheetHeader>

        <nav className="p-4 space-y-2">
          {navLinks.map((link) => (
            <Button
              key={link.target}
              variant="ghost"
              onClick={() => handleNavClick(link.target)}
              className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/5"
            >
              {link.label}
            </Button>
          ))}

          <div className="pt-4 border-t border-white/10 space-y-2">
            <Link href="/login" onClick={onClose}>
              <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-white hover:bg-white/5">
                Log In
              </Button>
            </Link>

            <Link href="/signup" onClick={onClose}>
              <Button className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white font-semibold">
                Join League
              </Button>
            </Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

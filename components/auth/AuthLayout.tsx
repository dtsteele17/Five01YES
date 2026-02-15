import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      {/* Back to home link */}
      <div className="absolute top-6 left-6 z-50">
        <Link
          href="/"
          className="text-muted-foreground hover:text-primary transition-colors text-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </div>

      <div className="container mx-auto px-4 py-8 min-h-screen flex items-center justify-center">
        <div className="grid lg:grid-cols-2 gap-12 max-w-6xl w-full items-center">
          {/* Left side - Branding */}
          <div className="hidden lg:block space-y-8">
            <div className="space-y-4">
              <div className="flex items-center">
                <Image 
                  src="/logo.png" 
                  alt="FIVE01" 
                  width={240} 
                  height={216} 
                  className="h-32 w-auto object-contain"
                  priority
                />
              </div>
              <p className="text-xl text-muted-foreground font-medium">
                Play. Compete. Climb the ranks.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { text: 'Join competitive ranked leagues', icon: CheckCircle },
                { text: 'Compete in weekly fixtures and tournaments', icon: CheckCircle },
                { text: 'Track advanced stats and performance', icon: CheckCircle },
                { text: 'Connect with the global darts community', icon: CheckCircle },
              ].map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-foreground/90">{benefit.text}</span>
                </div>
              ))}
            </div>

            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 backdrop-blur-sm">
              <p className="text-sm text-muted-foreground mb-2">Featured League</p>
              <p className="text-lg font-semibold text-foreground mb-1">Elite Division Spring 2026</p>
              <p className="text-sm text-primary">2,847 active players competing</p>
            </div>
          </div>

          {/* Right side - Form */}
          <div className="relative">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

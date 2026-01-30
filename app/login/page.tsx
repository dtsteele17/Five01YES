'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const supabase = createClient();

      console.log('[Login] Starting login process for:', email);

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error('[Login] Auth error details:', {
          message: authError.message,
          status: authError.status,
          name: authError.name,
          fullError: authError,
        });
        toast.error(`Login failed: ${authError.message} (Status: ${authError.status || 'N/A'})`);
        return;
      }

      if (!authData.user) {
        console.error('[Login] No user returned from login');
        toast.error('Login failed. Please try again.');
        return;
      }

      console.log('[Login] User authenticated:', authData.user.id);

      // Check if we have an active session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      console.log('[Login] Session check:', {
        hasSession: !!sessionData.session,
        sessionError: sessionError,
      });

      if (!sessionData.session) {
        console.error('[Login] No active session after login');
        toast.error('Session creation failed. Please check your email to confirm your account.');
        return;
      }

      // Verify profile exists (should be created by trigger on first signup)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[Login] Profile query error:', {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          fullError: profileError,
        });
        // Non-fatal, continue with login
      }

      if (!profile) {
        console.warn('[Login] Profile not found, may need to be created');
        // Profile should exist from trigger, but don't block login
      } else {
        console.log('[Login] Profile verified:', profile.username);
      }

      toast.success('Welcome back! Redirecting...');

      // Force session refresh
      await supabase.auth.refreshSession();

      setTimeout(() => {
        router.push('/app');
        router.refresh();
      }, 500);
    } catch (error: any) {
      console.error('[Login] Unexpected error:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        fullError: error,
      });
      toast.error(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      toast.error(error.message);
    }
  };

  return (
    <AuthLayout>
      <Card className="p-8 lg:p-10 bg-card/40 backdrop-blur-xl border-border/50 rounded-3xl shadow-2xl">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold font-display text-foreground">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to your FIVE01 account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                className={`h-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                  errors.email ? 'border-destructive' : ''
                }`}
                disabled={loading}
              />
              {errors.email && (
                <p className="text-xs text-destructive mt-1">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground font-medium">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  className={`h-12 pr-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                    errors.password ? 'border-destructive' : ''
                  }`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive mt-1">{errors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Log In'
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-card text-muted-foreground">or</span>
            </div>
          </div>

          <GoogleButton onClick={handleGoogleLogin} disabled={loading} />

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link
              href="/signup"
              className="text-primary hover:text-primary/80 font-semibold transition-colors"
            >
              Sign up
            </Link>
          </p>
        </div>
      </Card>
    </AuthLayout>
  );
}

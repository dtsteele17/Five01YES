'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Eye, EyeOff, Loader2, XCircle, CheckCircle2, AlertCircle, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';

// Helper function to format Supabase error messages into user-friendly format
function formatLoginError(error: string): { title: string; message: string } {
  const lowerError = error.toLowerCase();
  
  if (lowerError.includes('invalid login credentials')) {
    return {
      title: 'Incorrect email or password',
      message: 'Please check your email and password and try again. If you forgot your password, you can reset it below.'
    };
  }
  
  if (lowerError.includes('email not confirmed') || lowerError.includes('not confirmed')) {
    return {
      title: 'Email not verified',
      message: 'Please check your inbox and click the verification link we sent you. Check your spam folder if you don\'t see it.'
    };
  }
  
  if (lowerError.includes('invalid email')) {
    return {
      title: 'Invalid email address',
      message: 'Please enter a valid email address (e.g., name@example.com).'
    };
  }
  
  if (lowerError.includes('rate limit') || lowerError.includes('too many requests')) {
    return {
      title: 'Too many attempts',
      message: 'For security reasons, please wait a few minutes before trying again.'
    };
  }
  
  if (lowerError.includes('network') || lowerError.includes('fetch') || lowerError.includes('connection')) {
    return {
      title: 'Connection problem',
      message: 'Please check your internet connection and try again.'
    };
  }
  
  if (lowerError.includes('user not found') || lowerError.includes('user not exist')) {
    return {
      title: 'Account not found',
      message: 'We couldn\'t find an account with that email. Would you like to create one?'
    };
  }
  
  // Default error
  return {
    title: 'Login failed',
    message: error || 'An unexpected error occurred. Please try again.'
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [apiError, setApiError] = useState<{ title: string; message: string } | null>(null);
  const [touched, setTouched] = useState({ email: false, password: false });

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

  const isEmailValid = validateEmail(email);
  const isPasswordValid = password.length >= 6;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

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
        
        const formattedError = formatLoginError(authError.message);
        setApiError(formattedError);
        toast.error(formattedError.title);
        return;
      }

      if (!authData.user) {
        console.error('[Login] No user returned from login');
        setApiError({
          title: 'Login failed',
          message: 'Something went wrong. Please try again.'
        });
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
        setApiError({
          title: 'Account not verified',
          message: 'Please check your email to confirm your account before logging in.'
        });
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
      const formattedError = formatLoginError(error.message);
      setApiError(formattedError);
      toast.error(formattedError.title);
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
      const formattedError = formatLoginError(error.message);
      setApiError(formattedError);
      toast.error(formattedError.title);
    }
  };

  return (
    <AuthLayout>
      <Card className="p-5 sm:p-8 lg:p-10 bg-card/40 backdrop-blur-xl border-border/50 rounded-2xl sm:rounded-3xl shadow-2xl">
        <div className="space-y-4 sm:space-y-6">
          <div className="space-y-1 sm:space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">Welcome back</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Sign in to your FIVE01 account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3 sm:space-y-5">
            {/* API Error Display */}
            <AnimatePresence mode="wait">
              {apiError && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="rounded-xl bg-destructive/10 border border-destructive/20 overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-destructive font-semibold text-sm">{apiError.title}</p>
                        <p className="text-destructive/80 text-sm mt-1">{apiError.message}</p>
                        {apiError.title === 'Account not found' && (
                          <Link 
                            href="/signup" 
                            className="text-destructive/80 underline text-sm mt-2 hover:text-destructive inline-block"
                          >
                            Create an account
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors((prev) => ({ ...prev, email: undefined }));
                    setApiError(null);
                  }}
                  onBlur={() => setTouched({ ...touched, email: true })}
                  className={`h-12 pl-11 pr-10 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                    errors.email || (touched.email && !isEmailValid && email)
                      ? 'border-destructive focus:border-destructive'
                      : touched.email && isEmailValid
                      ? 'border-green-500 focus:border-green-500'
                      : ''
                  }`}
                  disabled={loading}
                />
                {touched.email && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isEmailValid ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : email ? (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    ) : null}
                  </div>
                )}
              </div>
              {errors.email && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.email}
                </p>
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
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                    setApiError(null);
                  }}
                  onBlur={() => setTouched({ ...touched, password: true })}
                  className={`h-12 pl-11 pr-12 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
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
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.password}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 sm:h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20 transition-all"
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
            </div>

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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Mail, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  Send
} from 'lucide-react';
import { toast } from 'sonner';

// Helper function to format Supabase error messages
function formatResetError(error: string): { title: string; message: string } {
  const lowerError = error.toLowerCase();
  
  if (lowerError.includes('rate limit') || lowerError.includes('too many requests')) {
    return {
      title: 'Too many attempts',
      message: 'For security reasons, please wait a few minutes before requesting another password reset.'
    };
  }
  
  if (lowerError.includes('invalid email')) {
    return {
      title: 'Invalid email address',
      message: 'Please enter a valid email address (e.g., name@example.com).'
    };
  }
  
  if (lowerError.includes('network') || lowerError.includes('fetch') || lowerError.includes('connection')) {
    return {
      title: 'Connection problem',
      message: 'Please check your internet connection and try again.'
    };
  }
  
  // Default error
  return {
    title: 'Reset failed',
    message: error || 'An unexpected error occurred. Please try again.'
  };
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [touched, setTouched] = useState(false);

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const isEmailValid = validateEmail(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError({
        title: 'Email required',
        message: 'Please enter your email address.'
      });
      return;
    }

    if (!isEmailValid) {
      setError({
        title: 'Invalid email',
        message: 'Please enter a valid email address.'
      });
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      console.log('[ForgotPassword] Sending reset email to:', email);

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery&next=/reset-password`,
      });

      if (resetError) {
        console.error('[ForgotPassword] Reset error:', resetError);
        const formattedError = formatResetError(resetError.message);
        setError(formattedError);
        toast.error(formattedError.title);
        return;
      }

      console.log('[ForgotPassword] Reset email sent successfully');
      setSuccess(true);
      toast.success('Password reset email sent!');

    } catch (error: any) {
      console.error('[ForgotPassword] Unexpected error:', error);
      const formattedError = formatResetError(error.message);
      setError(formattedError);
      toast.error(formattedError.title);
    } finally {
      setLoading(false);
    }
  };



  return (
    <AuthLayout>
      <Card className="p-5 sm:p-8 lg:p-10 bg-card/40 backdrop-blur-xl border-border/50 rounded-2xl sm:rounded-3xl shadow-2xl">
        <div className="space-y-4 sm:space-y-6">
          {/* Back button */}
          <Link
            href="/login"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform" />
            Back to login
          </Link>

          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 mx-auto bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">
                    Check your email
                  </h1>
                  <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
                    We sent a password reset link to <strong className="text-foreground">{email}</strong>
                  </p>
                </div>
                
                <div className="bg-muted/50 rounded-xl p-4 text-left space-y-3">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">What's next?</strong>
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Check your inbox (and spam folder)</li>
                    <li>Click the reset link in the email</li>
                    <li>Create your new password</li>
                  </ul>
                </div>

                <div className="flex justify-center">
                  <Link href="/login">
                    <Button className="px-8">
                      Back to login
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 sm:space-y-6"
              >
                <div className="space-y-1 sm:space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">
                    Forgot your password?
                  </h1>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    No worries! Enter your email and we'll send you a reset link.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                  {/* Error Display */}
                  <AnimatePresence mode="wait">
                    {error && (
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
                              <p className="text-destructive font-semibold text-sm">{error.title}</p>
                              <p className="text-destructive/80 text-sm mt-1">{error.message}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground font-medium">
                      Email address
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
                          setError(null);
                        }}
                        onBlur={() => setTouched(true)}
                        className={`h-12 pl-11 pr-10 bg-background/50 border-border focus:border-primary focus:ring-primary/20 transition-all ${
                          touched && !isEmailValid && email
                            ? 'border-destructive focus:border-destructive'
                            : touched && isEmailValid
                            ? 'border-green-500 focus:border-green-500'
                            : ''
                        }`}
                        disabled={loading}
                        autoFocus
                      />
                      {touched && email && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {isEmailValid ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                      )}
                    </div>
                    {touched && !isEmailValid && email && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Please enter a valid email address
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !email || !isEmailValid}
                    className="w-full h-10 sm:h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold text-base shadow-lg shadow-primary/20 transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Sending reset link...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-2" />
                        Send reset link
                      </>
                    )}
                  </Button>
                </form>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Remember your password?{' '}
                    <Link
                      href="/login"
                      className="text-primary hover:text-primary/80 font-semibold transition-colors"
                    >
                      Back to login
                    </Link>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </AuthLayout>
  );
}
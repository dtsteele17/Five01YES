'use client';

import Link from 'next/link';
import { ArrowLeft, Shield, Scale, Users, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/signup"
            className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform" />
            Back to Sign Up
          </Link>
          
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Scale className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
              <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <Card className="p-8 bg-card/50 backdrop-blur-sm border-border/50">
          <div className="prose prose-invert max-w-none">
            
            {/* Introduction */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">1. Introduction</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Welcome to FIVE01, a competitive darts gaming platform. These Terms of Service ("Terms") govern your use of the FIVE01 platform, website, and services (collectively, the "Service") operated by FIVE01 ("we," "our," or "us").
              </p>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of these terms, then you may not access the Service.
              </p>
            </div>

            {/* Account Terms */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">2. Account Terms</h2>
              </div>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p><strong>Account Creation:</strong> You must be at least 13 years old to use this Service. You must provide accurate and complete information when creating your account.</p>
                <p><strong>Account Security:</strong> You are responsible for safeguarding your account credentials and for all activities that occur under your account.</p>
                <p><strong>Username Policy:</strong> Your username must not be offensive, impersonate others, or violate any intellectual property rights.</p>
                <p><strong>One Account Per Person:</strong> You may only maintain one active account. Multiple accounts may result in suspension or termination.</p>
              </div>
            </div>

            {/* Platform Rules */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">3. Platform Rules & Fair Play</h2>
              </div>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p><strong>Fair Play:</strong> All gameplay must be conducted fairly and honestly. Any form of cheating, exploitation, or manipulation is strictly prohibited.</p>
                <p><strong>Competitive Integrity:</strong> Players must compete to the best of their ability in all ranked matches, leagues, and tournaments.</p>
                <p><strong>Score Reporting:</strong> Scores must be reported accurately and honestly. Falsifying scores will result in immediate account suspension.</p>
                <p><strong>Unsportsmanlike Conduct:</strong> Harassment, toxic behavior, or unsportsmanlike conduct toward other players is prohibited.</p>
              </div>
            </div>

            {/* Prohibited Uses */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">4. Prohibited Uses</h2>
              <div className="text-muted-foreground leading-relaxed">
                <p className="mb-3">You may not use our Service:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>For any unlawful purpose or to solicit others to commit unlawful acts</li>
                  <li>To violate any international, federal, provincial, or state regulations or laws</li>
                  <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
                  <li>To submit false or misleading information</li>
                  <li>To upload or transmit viruses or any other type of malicious code</li>
                  <li>To spam, phish, pharm, pretext, spider, crawl, or scrape</li>
                  <li>For any obscene or immoral purpose</li>
                  <li>To interfere with or circumvent security features of the Service</li>
                </ul>
              </div>
            </div>

            {/* User Content */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">5. User Content</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p><strong>Your Content:</strong> You retain ownership of content you submit to our Service, but you grant us a license to use, display, and distribute that content on the platform.</p>
                <p><strong>Content Standards:</strong> All content must be appropriate for a general audience and must not violate these Terms or applicable laws.</p>
                <p><strong>Content Removal:</strong> We reserve the right to remove any content that violates these Terms or that we deem inappropriate.</p>
              </div>
            </div>

            {/* Privacy */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your privacy is important to us. Please review our Privacy Policy, which also governs your use of the Service, to understand our practices.
              </p>
            </div>

            {/* Competitions & Rankings */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. Competitions & Rankings</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p><strong>League Play:</strong> League standings and rankings are calculated based on match results and may be subject to adjustment for rule violations.</p>
                <p><strong>Tournament Rules:</strong> Tournament-specific rules will be provided for each competition and take precedence over general platform rules.</p>
                <p><strong>Prizes & Rewards:</strong> Any prizes or rewards are subject to specific terms and conditions that will be communicated separately.</p>
                <p><strong>Disputes:</strong> Match disputes must be reported within 24 hours of the match conclusion.</p>
              </div>
            </div>

            {/* Service Availability */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. Service Availability</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>We strive to maintain high availability of our Service, but we do not guarantee uninterrupted access. The Service may be temporarily unavailable for maintenance, updates, or other operational reasons.</p>
                <p>We reserve the right to modify, suspend, or discontinue any part of the Service at any time with or without notice.</p>
              </div>
            </div>

            {/* Intellectual Property */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Intellectual Property Rights</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>The Service and its original content, features, and functionality are and will remain the exclusive property of FIVE01 and its licensors. The Service is protected by copyright, trademark, and other laws.</p>
                <p>You may not duplicate, copy, or reuse any portion of the HTML/CSS, JavaScript, or visual design elements without express written permission.</p>
              </div>
            </div>

            {/* Termination */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">10. Termination</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever, including without limitation if you breach the Terms.</p>
                <p>If you wish to terminate your account, you may simply discontinue using the Service or contact us to request account deletion.</p>
              </div>
            </div>

            {/* Disclaimers */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">11. Disclaimers</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>The information on this Service is provided on an "as is" basis. To the fullest extent permitted by law, we exclude all representations, warranties, and conditions relating to our Service and the use of this Service.</p>
                <p>Nothing in this disclaimer will limit any of our liabilities in any way that is not permitted under applicable law or exclude any of our liabilities that may not be excluded under applicable law.</p>
              </div>
            </div>

            {/* Limitation of Liability */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">12. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                In no case shall FIVE01, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.
              </p>
            </div>

            {/* Governing Law */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">13. Governing Law</h2>
              <p className="text-muted-foreground leading-relaxed">
                These Terms shall be interpreted and governed by the laws of the jurisdiction in which FIVE01 operates, without regard to conflict of law provisions.
              </p>
            </div>

            {/* Changes to Terms */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">14. Changes to Terms</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect.</p>
                <p>By continuing to access or use our Service after any revisions become effective, you agree to be bound by the revised terms.</p>
              </div>
            </div>

            {/* Contact Information */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">15. Contact Us</h2>
              <div className="text-muted-foreground leading-relaxed">
                <p>If you have any questions about these Terms of Service, please contact us:</p>
                <div className="mt-4 p-4 bg-muted/20 rounded-lg">
                  <p><strong>Email:</strong> legal@five01.com</p>
                  <p><strong>Platform:</strong> FIVE01</p>
                  <p><strong>Website:</strong> https://five01.com</p>
                </div>
              </div>
            </div>

            {/* Effective Date */}
            <div className="border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">
                These Terms of Service are effective as of {new Date().toLocaleDateString()} and were last updated on {new Date().toLocaleDateString()}.
              </p>
            </div>

          </div>
        </Card>

        {/* Footer Navigation */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-muted-foreground">
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <Link href="/signup" className="hover:text-primary transition-colors">
              Back to Sign Up
            </Link>
          </div>
          <p>FIVE01 - Play. Compete. Climb the ranks.</p>
        </div>
      </div>
    </div>
  );
}
'use client';

import Link from 'next/link';
import { ArrowLeft, Shield, Eye, Database, Lock, Globe, UserCheck, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function PrivacyPolicyPage() {
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
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
              <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <Card className="p-8 bg-card/50 backdrop-blur-sm border-border/50">
          <div className="prose prose-invert max-w-none">
            
            {/* Introduction */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Eye className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">1. Introduction</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                At FIVE01, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our competitive darts gaming platform, website, and services.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                By using our Service, you consent to the data practices described in this policy. If you do not agree with the data practices described in this Privacy Policy, you should not use our Service.
              </p>
            </div>

            {/* Information We Collect */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Database className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">2. Information We Collect</h2>
              </div>
              
              <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Personal Information</h3>
              <div className="text-muted-foreground leading-relaxed space-y-3">
                <p>We may collect personal information that you voluntarily provide, including:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Account Information:</strong> Username, email address, password (encrypted)</li>
                  <li><strong>Profile Information:</strong> Display name, avatar, bio, location (optional)</li>
                  <li><strong>Contact Information:</strong> Email for communications and account recovery</li>
                  <li><strong>Payment Information:</strong> If applicable for premium features (processed securely by third parties)</li>
                </ul>
              </div>

              <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Gaming & Performance Data</h3>
              <div className="text-muted-foreground leading-relaxed space-y-3">
                <p>To provide our competitive gaming service, we collect:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Match Data:</strong> Game scores, throws, statistics, match results</li>
                  <li><strong>Performance Metrics:</strong> Averages, rankings, league standings, tournament results</li>
                  <li><strong>Gaming History:</strong> Past matches, career progression, achievements</li>
                  <li><strong>Competitive Data:</strong> League participation, tournament entries, skill ratings</li>
                </ul>
              </div>

              <h3 className="text-lg font-semibold text-foreground mt-6 mb-3">Technical Information</h3>
              <div className="text-muted-foreground leading-relaxed space-y-3">
                <p>We automatically collect certain technical information:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Device Information:</strong> Browser type, operating system, device model</li>
                  <li><strong>Usage Data:</strong> Pages visited, time spent, features used</li>
                  <li><strong>Log Data:</strong> IP address, access times, error logs</li>
                  <li><strong>Cookies:</strong> Session management, preferences, analytics</li>
                </ul>
              </div>
            </div>

            {/* How We Use Your Information */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <UserCheck className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">3. How We Use Your Information</h2>
              </div>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>We use the information we collect to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Provide Gaming Services:</strong> Enable match play, track statistics, manage leagues and tournaments</li>
                  <li><strong>Account Management:</strong> Create and maintain your account, authenticate users, provide customer support</li>
                  <li><strong>Competitive Features:</strong> Calculate rankings, manage league standings, organize tournaments</li>
                  <li><strong>Communication:</strong> Send service-related emails, match notifications, league updates</li>
                  <li><strong>Platform Improvement:</strong> Analyze usage patterns, fix bugs, develop new features</li>
                  <li><strong>Security:</strong> Detect fraud, prevent cheating, protect against unauthorized access</li>
                  <li><strong>Legal Compliance:</strong> Comply with applicable laws and respond to legal requests</li>
                </ul>
              </div>
            </div>

            {/* Information Sharing */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">4. How We Share Your Information</h2>
              </div>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p><strong>Public Information:</strong> Your username, statistics, match results, and rankings are visible to other players as part of the competitive gaming experience.</p>
                
                <p><strong>We may share your information with:</strong></p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Other Players:</strong> Gaming statistics, match history, rankings (competitive data only)</li>
                  <li><strong>Service Providers:</strong> Third-party services that help us operate our platform (hosting, analytics, payment processing)</li>
                  <li><strong>Legal Authorities:</strong> When required by law or to protect our rights and safety</li>
                  <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                </ul>

                <p><strong>We do NOT sell your personal information to third parties for marketing purposes.</strong></p>
              </div>
            </div>

            {/* Data Security */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Lock className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">5. Data Security</h2>
              </div>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>We implement appropriate security measures to protect your personal information:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Encryption:</strong> Data transmission is encrypted using SSL/TLS</li>
                  <li><strong>Password Security:</strong> Passwords are hashed and salted using industry-standard methods</li>
                  <li><strong>Access Controls:</strong> Limited access to personal data on a need-to-know basis</li>
                  <li><strong>Regular Monitoring:</strong> Continuous monitoring for security threats and vulnerabilities</li>
                  <li><strong>Data Backup:</strong> Regular backups with secure storage practices</li>
                </ul>
                <p>However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee its absolute security.</p>
              </div>
            </div>

            {/* Data Retention */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">6. Data Retention</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>We retain your information for as long as necessary to provide our services and fulfill the purposes outlined in this Privacy Policy:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Account Data:</strong> Retained while your account is active and for a reasonable period after deactivation</li>
                  <li><strong>Gaming Data:</strong> Match results and statistics are retained to maintain competitive integrity and historical records</li>
                  <li><strong>Communication Data:</strong> Support communications retained for operational purposes</li>
                  <li><strong>Legal Data:</strong> Some data may be retained longer to comply with legal obligations</li>
                </ul>
              </div>
            </div>

            {/* Your Rights and Choices */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">7. Your Rights and Choices</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>You have certain rights regarding your personal information:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Access:</strong> Request access to your personal information</li>
                  <li><strong>Update:</strong> Correct or update your account information through your profile settings</li>
                  <li><strong>Delete:</strong> Request deletion of your account and associated data</li>
                  <li><strong>Export:</strong> Request a copy of your data in a portable format</li>
                  <li><strong>Opt-out:</strong> Unsubscribe from marketing communications (where applicable)</li>
                  <li><strong>Limit Processing:</strong> Request limitation of processing in certain circumstances</li>
                </ul>
                <p>To exercise these rights, please contact us using the information provided in the Contact section below.</p>
              </div>
            </div>

            {/* Cookies and Tracking */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">8. Cookies and Tracking Technologies</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>We use cookies and similar tracking technologies to improve your experience:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Essential Cookies:</strong> Required for basic platform functionality and security</li>
                  <li><strong>Performance Cookies:</strong> Help us understand how users interact with our platform</li>
                  <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
                  <li><strong>Analytics Cookies:</strong> Provide insights into platform usage and performance</li>
                </ul>
                <p>You can control cookies through your browser settings, but some features may not function properly if cookies are disabled.</p>
              </div>
            </div>

            {/* Third-Party Services */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">9. Third-Party Services</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>Our platform may integrate with third-party services:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Authentication:</strong> Google OAuth for account creation and login</li>
                  <li><strong>Analytics:</strong> Usage analytics to improve our service</li>
                  <li><strong>Infrastructure:</strong> Cloud hosting and database services</li>
                  <li><strong>Communication:</strong> Email service providers for notifications</li>
                </ul>
                <p>These third parties have their own privacy policies. We encourage you to read their privacy statements to understand how they collect and use your information.</p>
              </div>
            </div>

            {/* International Data Transfers */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">10. International Data Transfers</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your information may be transferred to and maintained on computers located outside of your jurisdiction where data protection laws may differ. By using our Service, you consent to your information being transferred to our facilities and third parties as described in this policy.
              </p>
            </div>

            {/* Children's Privacy */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">11. Children's Privacy</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>Our Service is intended for users who are at least 13 years of age. We do not knowingly collect personal information from children under 13.</p>
                <p>If you are a parent or guardian and believe your child has provided us with personal information, please contact us. We will take steps to remove such information and terminate the child's account.</p>
              </div>
            </div>

            {/* Changes to Privacy Policy */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground m-0">12. Changes to This Privacy Policy</h2>
              </div>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>We may update our Privacy Policy from time to time. We will notify you of any changes by:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Posting the new Privacy Policy on this page</li>
                  <li>Updating the "Last updated" date at the top of this policy</li>
                  <li>Sending you an email notification for material changes</li>
                  <li>Providing prominent notice within the platform</li>
                </ul>
                <p>Your continued use of the Service after any changes indicates your acceptance of the updated Privacy Policy.</p>
              </div>
            </div>

            {/* Legal Basis (EU Users) */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">13. Legal Basis for Processing (EU Users)</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4">
                <p>If you are located in the European Union, our legal basis for processing your personal information includes:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Contract Performance:</strong> Processing necessary to provide our gaming services</li>
                  <li><strong>Legitimate Interests:</strong> Improving our platform, preventing fraud, ensuring security</li>
                  <li><strong>Legal Compliance:</strong> Meeting our legal obligations</li>
                  <li><strong>Consent:</strong> Where you have given specific consent for certain processing activities</li>
                </ul>
              </div>
            </div>

            {/* Contact Information */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">14. Contact Us</h2>
              <div className="text-muted-foreground leading-relaxed">
                <p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
                <div className="mt-4 p-4 bg-muted/20 rounded-lg space-y-2">
                  <p><strong>Privacy Officer</strong></p>
                  <p><strong>Email:</strong> privacy@five01.com</p>
                  <p><strong>Data Protection Email:</strong> dpo@five01.com</p>
                  <p><strong>Platform:</strong> FIVE01</p>
                  <p><strong>Website:</strong> https://five01.com</p>
                </div>
                <p className="mt-4">We will respond to your inquiry within 30 days.</p>
              </div>
            </div>

            {/* Effective Date */}
            <div className="border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">
                This Privacy Policy is effective as of {new Date().toLocaleDateString()} and was last updated on {new Date().toLocaleDateString()}.
              </p>
            </div>

          </div>
        </Card>

        {/* Footer Navigation */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-muted-foreground">
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-primary transition-colors">
              Terms of Service
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
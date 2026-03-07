const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testForgotPassword(email) {
  console.log('🔍 TESTING FORGOT PASSWORD FUNCTIONALITY');
  console.log('=' .repeat(50));

  if (!email) {
    console.log('❌ Please provide an email address:');
    console.log('   node test_forgot_password.js your@email.com');
    return;
  }

  try {
    console.log(`📧 Testing password reset for: ${email}`);
    console.log('⏳ Sending reset email...');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:3000/reset-password',
    });

    if (error) {
      console.log('❌ FAILED to send reset email:');
      console.log(`   Error: ${error.message}`);
      console.log(`   Code: ${error.status || 'N/A'}`);
      
      // Common issues and solutions
      if (error.message.includes('rate limit')) {
        console.log('\n💡 SOLUTION: Wait a few minutes before trying again (rate limited)');
      } else if (error.message.includes('invalid')) {
        console.log('\n💡 SOLUTION: Check that the email address is valid');
      } else if (error.message.includes('SMTP')) {
        console.log('\n💡 SOLUTION: Supabase email service not configured - check project settings');
      }
    } else {
      console.log('✅ SUCCESS! Reset email sent successfully');
      console.log(`📬 Check the inbox for: ${email}`);
      console.log('📁 Also check spam/junk folder');
      
      console.log('\n📋 NEXT STEPS:');
      console.log('   1. Check email inbox for reset link');
      console.log('   2. Click the reset link');
      console.log('   3. Should redirect to: http://localhost:3000/reset-password');
      console.log('   4. Create new password and test login');
    }

  } catch (error) {
    console.log('❌ UNEXPECTED ERROR:');
    console.log(`   ${error.message}`);
    
    if (error.message.includes('fetch')) {
      console.log('\n💡 SOLUTION: Check internet connection and Supabase URL');
    } else if (error.message.includes('Invalid API key')) {
      console.log('\n💡 SOLUTION: Check NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    }
  }

  console.log('\n🔧 CONFIGURATION CHECKLIST:');
  console.log(`   ✅ NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : '❌ Missing'}`);
  console.log(`   ✅ NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : '❌ Missing'}`);
  
  console.log('\n📖 IF EMAILS AREN\'T WORKING:');
  console.log('   1. Go to Supabase Dashboard → Authentication → Email Templates');
  console.log('   2. Configure "Reset Password" template (see FORGOT_PASSWORD_SETUP.md)');
  console.log('   3. Add redirect URL: http://localhost:3000/reset-password');
  console.log('   4. Check SMTP settings in Authentication → Settings');
}

// Get email from command line
const email = process.argv[2];
testForgotPassword(email);
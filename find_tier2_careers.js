const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://azrmgtukcgqslnilodky.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cm1ndHVrY2dxc2xuaWxvZGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjQ5ODQsImV4cCI6MjA4NDcwMDk4NH0.W8ojLlk2fq28d0GVCSZ4zyncm9ZW0STDf8R4RyLnJ9I';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findTier2Careers() {
  console.log('🔍 FINDING TIER 2+ CAREERS');
  console.log('=' .repeat(40));
  
  try {
    // Find all tier 2+ careers
    const { data: careers, error } = await supabase
      .from('career_profiles')
      .select('*')
      .gte('tier', 2)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (error) throw error;
    
    if (careers.length === 0) {
      console.log('❌ No Tier 2+ careers found in database');
      
      // Check any careers at all
      const { data: allCareers, error: allError } = await supabase
        .from('career_profiles')
        .select('id, tier, status, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (allCareers?.length > 0) {
        console.log('\n📋 Found these active careers:');
        allCareers.forEach(career => {
          console.log(`   ${career.id} - Tier ${career.tier} (${career.status})`);
        });
      } else {
        console.log('\n❌ No active careers found at all');
      }
      return;
    }
    
    console.log(`✅ Found ${careers.length} Tier 2+ careers:\n`);
    
    careers.forEach((career, index) => {
      console.log(`${index + 1}. Career ID: ${career.id}`);
      console.log(`   Tier: ${career.tier}, Season: ${career.season}, Week: ${career.week}`);
      console.log(`   Created: ${new Date(career.created_at).toLocaleDateString()}`);
      console.log('');
    });
    
    // Use the first one for detailed debugging
    if (careers.length > 0) {
      console.log(`🎯 Using career ${careers[0].id} for detailed debug...`);
      console.log('Run: node debug_tier2_career.js ' + careers[0].id);
    }
    
  } catch (error) {
    console.error('❌ Search failed:', error);
  }
}

findTier2Careers();
const { createClient } = require('@supabase/supabase-js');

// Use the known Supabase values
const supabaseUrl = 'https://azrmgtukcgqslnilodky.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cm1ndHVrY2dxc2xuaWxvZGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjQ5ODQsImV4cCI6MjA4NDcwMDk4NH0.W8ojLlk2fq28d0GVCSZ4zyncm9ZW0STDf8R4RyLnJ9I';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugTier2Career(careerId) {
  console.log('🔍 DEBUGGING TIER 2 CAREER ISSUE');
  console.log('=' .repeat(60));
  
  if (!careerId) {
    // Get from the image URL - looks like it's in the URL
    careerId = '97e3f16f-737b-4e8b-969e-67bcf1bca715';
  }

  console.log(`📋 Career ID: ${careerId}`);
  console.log('');

  try {
    // Check career basic info
    const { data: career, error: careerError } = await supabase
      .from('career_profiles')
      .select('*')
      .eq('id', careerId)
      .single();
      
    if (careerError) throw careerError;
    
    console.log('🎯 CAREER PROFILE:');
    console.log(`   Tier: ${career.tier}`);
    console.log(`   Season: ${career.season}`);
    console.log(`   Week: ${career.week}`);
    console.log(`   Day: ${career.day}`);
    console.log(`   Status: ${career.status}`);
    console.log('');

    // Check events
    const { data: events, error: eventsError } = await supabase
      .from('career_events')
      .select('*')
      .eq('career_id', careerId)
      .order('sequence_no');
      
    if (eventsError) throw eventsError;
    
    console.log('🗓️ CAREER EVENTS:');
    events.forEach(event => {
      console.log(`   ${event.sequence_no}. [${event.status.toUpperCase()}] ${event.event_type} - ${event.event_name}`);
    });
    console.log('');

    // Check current/next event
    const { data: nextEvent, error: nextEventError } = await supabase
      .from('career_events')
      .select('*')
      .eq('career_id', careerId)
      .in('status', ['active', 'pending'])
      .order('sequence_no')
      .limit(1)
      .single();
      
    if (nextEvent) {
      console.log('⏭️ NEXT EVENT:');
      console.log(`   ID: ${nextEvent.id}`);
      console.log(`   Type: ${nextEvent.event_type}`);
      console.log(`   Name: ${nextEvent.event_name}`);
      console.log(`   Status: ${nextEvent.status}`);
      console.log(`   Sequence: ${nextEvent.sequence_no}`);
      console.log('');

      // Check matches for this event
      const { data: matches, error: matchesError } = await supabase
        .from('career_matches')
        .select(`
          *,
          career_opponents (
            first_name,
            last_name,
            nickname
          )
        `)
        .eq('event_id', nextEvent.id);
        
      if (matches?.length > 0) {
        console.log('🥊 MATCHES FOR THIS EVENT:');
        matches.forEach(match => {
          const opponentName = match.career_opponents ? 
            `${match.career_opponents.first_name || ''} ${match.career_opponents.nickname ? "'" + match.career_opponents.nickname + "'" : ''} ${match.career_opponents.last_name || ''}`.trim() :
            'Unknown';
          console.log(`   Match ID: ${match.id}`);
          console.log(`   Opponent: ${opponentName}`);
          console.log(`   Result: ${match.result}`);
          console.log(`   Format: Best of ${match.format_legs}`);
          console.log(`   ---`);
        });
      } else {
        console.log('❌ NO MATCHES FOUND FOR CURRENT EVENT');
        console.log('   This is the problem! League events need matches.');
      }
      console.log('');
    } else {
      console.log('❌ NO ACTIVE OR PENDING EVENTS FOUND');
      console.log('   This could be why Continue button isn\'t working');
      console.log('');
    }

    // Check league standings
    if (career.tier >= 2) {
      const { data: standings, error: standingsError } = await supabase
        .from('career_league_standings')
        .select(`
          *,
          career_opponents (
            first_name,
            last_name,
            nickname
          )
        `)
        .eq('career_id', careerId)
        .eq('season', career.season)
        .eq('tier', career.tier)
        .order('points', { ascending: false })
        .order('legs_for', { ascending: false });

      if (standings?.length > 0) {
        console.log('🏆 LEAGUE STANDINGS:');
        standings.forEach((standing, index) => {
          const name = standing.is_player ? 'You' : 
            `${standing.career_opponents?.first_name || ''} ${standing.career_opponents?.last_name || ''}`.trim();
          console.log(`   ${index + 1}. ${name} - P:${standing.played} W:${standing.won} L:${standing.lost} Pts:${standing.points}`);
        });
      } else {
        console.log('❌ NO LEAGUE STANDINGS FOUND');
        console.log('   League standings missing - this breaks fixtures');
      }
      console.log('');
    }

    // Test the RPC function that should create matches
    console.log('🧪 TESTING RPC FUNCTIONS:');
    
    // Test career home RPC
    try {
      const { data: homeData, error: homeError } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed', { 
        p_career_id: careerId 
      });
      
      if (homeError) {
        console.log(`❌ Career home RPC failed: ${homeError.message}`);
      } else {
        console.log('✅ Career home RPC success');
        console.log(`   Next event type: ${homeData.next_event?.event_type}`);
        console.log(`   Next event name: ${homeData.next_event?.event_name}`);
        console.log(`   League opponent: ${homeData.next_event?.league_opponent_name || 'NOT SET'}`);
        console.log(`   Match ID: ${homeData.next_event?.match_id || 'NOT SET'}`);
      }
    } catch (error) {
      console.log(`❌ Career home RPC error: ${error.message}`);
    }
    
    // Test fixtures RPC
    try {
      const { data: fixturesData, error: fixturesError } = await supabase.rpc('rpc_get_week_fixtures_with_match_lock', { 
        p_career_id: careerId 
      });
      
      if (fixturesError) {
        console.log(`❌ Fixtures RPC failed: ${fixturesError.message}`);
      } else {
        console.log('✅ Fixtures RPC success');
        console.log(`   Week: ${fixturesData.week}`);
        console.log(`   Event: ${fixturesData.event_name}`);
        console.log(`   Fixtures count: ${fixturesData.fixtures?.length || 0}`);
        if (fixturesData.fixtures?.length > 0) {
          console.log(`   Your match: vs ${fixturesData.fixtures[0].away_team}`);
        }
      }
    } catch (error) {
      console.log(`❌ Fixtures RPC error: ${error.message}`);
    }
    
    console.log('');
    console.log('💡 DIAGNOSIS:');
    
    if (career.tier < 2) {
      console.log('   ❌ Career is not tier 2+ - this is not a league career');
    } else if (!nextEvent) {
      console.log('   ❌ No active/pending events - career progression broken');
    } else if (nextEvent.event_type !== 'league') {
      console.log(`   ⚠️ Next event is ${nextEvent.event_type}, not league - might be tournament time`);
    } else if (!matches || matches.length === 0) {
      console.log('   ❌ No matches created for league event - this is the main problem');
      console.log('   💊 SOLUTION: Need to run fixture migration to create matches');
    } else {
      console.log('   ✅ Everything looks correct - may be a UI issue');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run with career ID from the image URL
debugTier2Career();
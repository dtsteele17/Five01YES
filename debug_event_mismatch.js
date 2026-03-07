const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function debugEventMismatch(careerId) {
  console.log('🔍 DEBUGGING EVENT SELECTION MISMATCH FOR CAREER:', careerId);
  console.log('=' .repeat(80));

  try {
    // Use the debug function to see all events
    const { data: debug, error } = await supabase.rpc('rpc_debug_event_selection', { 
      p_career_id: careerId 
    });
    
    if (error) throw error;
    
    console.log('\n📋 CAREER INFO:');
    console.log(JSON.stringify(debug.career, null, 2));
    
    console.log('\n🎯 ALL EVENTS:');
    debug.all_events.forEach(event => {
      console.log(`${event.sequence}. [${event.status.toUpperCase()}] ${event.type.toUpperCase()} - ${event.name}`);
      console.log(`    Matches: ${event.match_count}, Pending: ${event.pending_matches}`);
    });
    
    console.log('\n🟢 ACTIVE EVENT (what career home shows):');
    if (debug.selected_active) {
      console.log(`${debug.selected_active.sequence}. ${debug.selected_active.type.toUpperCase()} - ${debug.selected_active.name}`);
      console.log(`Status: ${debug.selected_active.status}`);
    } else {
      console.log('None');
    }
    
    console.log('\n⏳ PENDING EVENT (fallback):');
    if (debug.selected_pending) {
      console.log(`${debug.selected_pending.sequence}. ${debug.selected_pending.type.toUpperCase()} - ${debug.selected_pending.name}`);
      console.log(`Status: ${debug.selected_pending.status}`);
    } else {
      console.log('None');
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Get career ID from command line or use the one from the image
const careerId = process.argv[2] || 'b5c85623-4b79-4161-9487-242ecb740711';
debugEventMismatch(careerId);
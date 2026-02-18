'use client';

// This is a re-export of the quick match page component with private match context
// The game logic is identical, but we use a different route for clarity

import QuickMatchRoomPage from '../../quick-match/match/page';

export default function PrivateMatchGamePage() {
  // The quick match page handles all the game logic
  // We just render it here since private matches work the same way
  return <QuickMatchRoomPage />;
}

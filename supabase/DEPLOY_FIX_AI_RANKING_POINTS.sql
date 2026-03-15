-- =============================================================================
-- DEPRECATED: This file is superseded by DEPLOY_FIX_AI_RANKING_BALANCED.sql
-- which implements a proper zero-sum-ish system with expectation penalties
-- =============================================================================
-- The new balanced system:
-- - Awards points: W=50, RU=30, SF=18, QF=10, L16=5, L32=2, L64=0
-- - Deducts points based on rank vs performance (expectation penalty)
-- - Caps AI points at starting_points + 100 to prevent inflation
-- =============================================================================

-- Keeping a minimal version here for backwards compatibility
-- See DEPLOY_FIX_AI_RANKING_BALANCED.sql for the full implementation

DROP FUNCTION IF EXISTS rpc_pro_tour_award_ai_points(UUID, UUID, JSON);
DROP FUNCTION IF EXISTS rpc_pro_tour_award_ai_points(UUID, UUID, JSONB);

-- The actual function is defined in DEPLOY_FIX_AI_RANKING_BALANCED.sql

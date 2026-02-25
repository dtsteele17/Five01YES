-- =======================================================
-- CHECK TOURNAMENT STATUS ENUM VALUES  
-- =======================================================

-- Check if status column has ENUM constraint
SELECT 
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    c.character_maximum_length
FROM information_schema.columns c
WHERE c.table_name = 'tournaments' 
AND c.column_name = 'status';

-- Check for CHECK constraints on status column
SELECT 
    cc.constraint_name,
    cc.check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.constraint_column_usage ccu 
    ON cc.constraint_name = ccu.constraint_name
WHERE ccu.table_name = 'tournaments' 
AND ccu.column_name = 'status';

-- Check for ENUM type definition if it exists
SELECT 
    t.typname,
    array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
WHERE t.typname LIKE '%tournament%status%' 
   OR t.typname LIKE '%status%'
GROUP BY t.typname;

-- Show all current status values in the table
SELECT 
    status,
    COUNT(*) as count,
    MIN(created_at) as first_used,
    MAX(created_at) as last_used
FROM tournaments 
WHERE status IS NOT NULL
GROUP BY status 
ORDER BY count DESC;

-- Test if 'scheduled' is a valid status value
-- (This will fail if there's a constraint preventing it)
/*
INSERT INTO tournaments (
    name,
    start_at, 
    max_participants,
    status,
    created_by,
    game_mode,
    legs_per_match,
    double_out,
    round_scheduling,
    entry_type
) VALUES (
    'Status Test Tournament',
    NOW() + INTERVAL '1 day',
    8,
    'scheduled', 
    '5010a7f4-54e3-44a5-8746-ce1aba9ed83d',
    501,
    3,
    true,
    'one_day',
    'open'
);
*/
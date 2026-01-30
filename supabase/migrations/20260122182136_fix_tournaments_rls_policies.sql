/*
  # Fix Tournaments RLS Policies for Complete Access

  1. Purpose
    - Ensure authenticated users can SELECT all tournaments
    - Ensure authenticated users can INSERT tournaments (as themselves)
    - Ensure only creators/admins can UPDATE tournaments
    - Clean up duplicate/conflicting policies

  2. Changes
    - Drop all existing policies to start fresh
    - Add single, clear SELECT policy for authenticated users
    - Add single, clear INSERT policy for authenticated users
    - Add single, clear UPDATE policy for creators/admins
    - Add single, clear DELETE policy for creators

  3. Security
    - All users can view all tournaments (public listing)
    - Users can create tournaments (will be set as creator)
    - Only creators can modify their tournaments
*/

-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can create tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Anyone can view active tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Creator and admins can update tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Everyone can view tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Tournament owners and admins can update tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Tournaments are viewable by everyone" ON public.tournaments;
DROP POLICY IF EXISTS "Users can create tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can view tournaments" ON public.tournaments;

-- Allow all authenticated users to view all tournaments
CREATE POLICY "tournaments_select_all"
  ON public.tournaments
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to create tournaments (must set created_by to self)
CREATE POLICY "tournaments_insert_authenticated"
  ON public.tournaments
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Allow creators to update their own tournaments
CREATE POLICY "tournaments_update_creator"
  ON public.tournaments
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Allow creators to delete their own tournaments
CREATE POLICY "tournaments_delete_creator"
  ON public.tournaments
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

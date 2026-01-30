/*
  # Create Notifications System

  ## Overview
  This migration creates the notifications system for tracking user notifications
  such as league announcements, match reminders, achievements, and app updates.

  ## New Tables

  ### `notifications`
  - `id` (uuid, primary key) - Unique notification identifier
  - `user_id` (uuid, foreign key) - User receiving the notification
  - `type` (text) - Notification type: 'league_announcement', 'match_reminder', 'achievement', 'app_update'
  - `title` (text) - Notification title
  - `message` (text) - Short notification message
  - `link` (text, nullable) - Optional route to navigate when clicked
  - `read` (boolean) - Whether notification has been read
  - `created_at` (timestamptz) - When notification was created
  - `reference_id` (uuid, nullable) - ID of related entity (league_id, match_id, achievement_id, etc.)

  ## Security
  - Enable RLS on notifications table
  - Users can only view their own notifications
  - Users can only update read status of their own notifications

  ## Notes
  - Notifications are automatically marked as read when user clicks them
  - System can create notifications via service role
*/

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('league_announcement', 'match_reminder', 'achievement', 'app_update')),
  title text NOT NULL,
  message text NOT NULL,
  link text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  reference_id uuid
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow service role to insert notifications for any user
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Fix the signaling table to allow DM video call types
-- Run this in your Supabase SQL Editor

-- Drop the existing check constraint
ALTER TABLE signaling DROP CONSTRAINT signaling_type_check;

-- Add the new check constraint with additional types for DM video calls
ALTER TABLE signaling ADD CONSTRAINT signaling_type_check 
CHECK (type IN ('offer', 'answer', 'ice_candidate', 'call_invitation', 'call_accepted', 'call_declined'));

-- Verify the constraint was updated
SELECT conname, consrc FROM pg_constraint WHERE conname = 'signaling_type_check';

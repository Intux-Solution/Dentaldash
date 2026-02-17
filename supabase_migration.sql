-- Add services column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;

-- Add chatbot_context_url column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS chatbot_context_url TEXT;

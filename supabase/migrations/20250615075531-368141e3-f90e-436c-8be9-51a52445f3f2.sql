
-- Create donations table to track all donations
CREATE TABLE public.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT NOT NULL DEFAULT 'CZK',
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  stripe_session_id TEXT UNIQUE,
  donor_name TEXT,
  donor_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own donations
CREATE POLICY "Users can view their own donations" ON public.donations
  FOR SELECT
  USING (user_id = auth.uid());

-- Create policy for inserting donations (open for edge functions)
CREATE POLICY "Allow donation inserts" ON public.donations
  FOR INSERT
  WITH CHECK (true);

-- Create policy for updating donations (for payment status updates)
CREATE POLICY "Allow donation updates" ON public.donations  
  FOR UPDATE
  USING (true);

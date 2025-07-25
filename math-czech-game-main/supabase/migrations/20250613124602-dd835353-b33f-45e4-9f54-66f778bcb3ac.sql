
-- Create enum for achievement types
CREATE TYPE public.achievement_type AS ENUM ('first_correct', 'streak_3', 'streak_7', 'streak_30', 'perfect_game', 'speed_demon', 'math_master', 'spelling_wizard', 'persistent_learner', 'early_bird');

-- Create achievements table
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type achievement_type NOT NULL,
  icon TEXT NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  condition_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user achievements table
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, achievement_id)
);

-- Create user levels table
CREATE TABLE public.user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  current_level INTEGER DEFAULT 1,
  total_xp INTEGER DEFAULT 0,
  xp_to_next_level INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user streaks table
CREATE TABLE public.user_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  streak_type TEXT DEFAULT 'daily',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for achievements (public read)
CREATE POLICY "Anyone can view achievements" ON public.achievements FOR SELECT USING (true);

-- RLS Policies for user_achievements
CREATE POLICY "Users can view their own achievements" ON public.user_achievements FOR SELECT USING (true);
CREATE POLICY "Users can insert their own achievements" ON public.user_achievements FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own achievements" ON public.user_achievements FOR UPDATE USING (true);

-- RLS Policies for user_levels
CREATE POLICY "Users can view their own levels" ON public.user_levels FOR SELECT USING (true);
CREATE POLICY "Users can insert their own levels" ON public.user_levels FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own levels" ON public.user_levels FOR UPDATE USING (true);

-- RLS Policies for user_streaks
CREATE POLICY "Users can view their own streaks" ON public.user_streaks FOR SELECT USING (true);
CREATE POLICY "Users can insert their own streaks" ON public.user_streaks FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own streaks" ON public.user_streaks FOR UPDATE USING (true);

-- Insert default achievements
INSERT INTO public.achievements (name, description, type, icon, xp_reward, condition_data) VALUES
('První správná odpověď', 'Odpověděl jsi správně na svou první otázku!', 'first_correct', '🎯', 50, '{"required": 1}'),
('Třídenní šňůra', 'Procvičoval jsi 3 dny v řadě!', 'streak_3', '🔥', 100, '{"days": 3}'),
('Týdenní bojovník', 'Procvičoval jsi celý týden!', 'streak_7', '⚡', 200, '{"days": 7}'),
('Měsíční mistr', 'Procvičoval jsi 30 dní v řadě!', 'streak_30', '👑', 500, '{"days": 30}'),
('Perfektní hra', 'Dokončil jsi hru bez jediné chyby!', 'perfect_game', '💎', 150, '{"errors": 0}'),
('Rychlík', 'Odpověděl jsi na 10 otázek za méně než minutu!', 'speed_demon', '💨', 200, '{"questions": 10, "time": 60}'),
('Matematik', 'Zodpověděl jsi správně 100 matematických úloh!', 'math_master', '🧮', 300, '{"subject": "math", "correct": 100}'),
('Kouzelník pravopisu', 'Zodpověděl jsi správně 100 otázek z pravopisu!', 'spelling_wizard', '📝', 300, '{"subject": "spelling", "correct": 100}'),
('Vytrvalý učenec', 'Procvičoval jsi celkem 50 hodin!', 'persistent_learner', '📚', 400, '{"hours": 50}'),
('Ranní ptáče', 'Procvičoval jsi před 8. hodinou ranní!', 'early_bird', '🌅', 100, '{"hour": 8}');

-- Create function to calculate XP required for next level
CREATE OR REPLACE FUNCTION public.calculate_xp_for_level(level_num INTEGER)
RETURNS INTEGER AS $$
BEGIN
  RETURN level_num * 100 + (level_num - 1) * 50;
END;
$$ LANGUAGE plpgsql;

-- Create function to update user level based on XP
CREATE OR REPLACE FUNCTION public.update_user_level(p_user_id TEXT, p_xp_gained INTEGER)
RETURNS TABLE(new_level INTEGER, level_up BOOLEAN) AS $$
DECLARE
  current_record RECORD;
  new_total_xp INTEGER;
  new_level_num INTEGER;
  xp_needed INTEGER;
  did_level_up BOOLEAN := FALSE;
BEGIN
  -- Get or create user level record
  SELECT * INTO current_record FROM public.user_levels WHERE user_id = p_user_id;
  
  IF current_record IS NULL THEN
    INSERT INTO public.user_levels (user_id, total_xp) VALUES (p_user_id, p_xp_gained);
    SELECT * INTO current_record FROM public.user_levels WHERE user_id = p_user_id;
  END IF;
  
  new_total_xp := current_record.total_xp + p_xp_gained;
  new_level_num := current_record.current_level;
  
  -- Calculate new level
  WHILE new_total_xp >= public.calculate_xp_for_level(new_level_num + 1) LOOP
    new_level_num := new_level_num + 1;
    did_level_up := TRUE;
  END LOOP;
  
  xp_needed := public.calculate_xp_for_level(new_level_num + 1) - new_total_xp;
  
  -- Update the record
  UPDATE public.user_levels 
  SET 
    current_level = new_level_num,
    total_xp = new_total_xp,
    xp_to_next_level = xp_needed,
    updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN QUERY SELECT new_level_num, did_level_up;
END;
$$ LANGUAGE plpgsql;

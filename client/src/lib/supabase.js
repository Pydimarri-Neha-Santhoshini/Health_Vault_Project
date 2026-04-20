import { createClient } from '@supabase/supabase-js';

// Load from Vite / CRA env depending on what user runs
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://mock-url.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'mock-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

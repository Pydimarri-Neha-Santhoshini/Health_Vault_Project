-- Drop tables if they already exist to cleanly recreate
DROP TABLE IF EXISTS emergency_access CASCADE;
DROP TABLE IF EXISTS insights CASCADE;
DROP TABLE IF EXISTS records CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    dob DATE,
    blood_group TEXT,
    emergency_contact TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Records Table
CREATE TABLE records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    tags TEXT[],
    date DATE NOT NULL,
    file_url TEXT NOT NULL,
    file_hash TEXT,
    share_tokens JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insights Table
CREATE TABLE insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID REFERENCES records(id) ON DELETE CASCADE NOT NULL,
    generated_date TIMESTAMPTZ DEFAULT now(),
    structured_data JSONB NOT NULL,
    recommendations TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Emergency Access Table
CREATE TABLE emergency_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- RLS Policies Setup --
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_access ENABLE ROW LEVEL SECURITY;

-- Users Policy
CREATE POLICY "Users can view and update their own profile" ON users
    FOR ALL USING (auth.uid() = id);

-- Records Policy
CREATE POLICY "Users can manage their own records" ON records
    FOR ALL USING (auth.uid() = user_id);

-- Insights Policy
CREATE POLICY "Users can view their own insights" ON insights
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM records WHERE records.id = insights.record_id AND records.user_id = auth.uid()
        )
    );
CREATE POLICY "Users can manage their own insights" ON insights
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM records WHERE records.id = insights.record_id AND records.user_id = auth.uid()
        )
    );

-- Emergency Access Policy
CREATE POLICY "Users can manage their own emergency tokens" ON emergency_access
    FOR ALL USING (auth.uid() = user_id);
-- Allow public unauthenticated read access if token exists and isn't expired
CREATE POLICY "Public can view valid emergency tokens" ON emergency_access
    FOR SELECT USING (expires_at > now());


-- Set up Storage Bucket (Requires manual creation of bucket 'health-records' in dashboard first, then run these policies)
-- The below assumes a bucket named 'health-records' exists.
-- CREATE POLICY "Users can upload their own files" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'health-records' AND auth.uid()::text = (storage.foldername(name))[1] );
-- CREATE POLICY "Users can read their own files" ON storage.objects FOR SELECT USING ( bucket_id = 'health-records' AND auth.uid()::text = (storage.foldername(name))[1] );

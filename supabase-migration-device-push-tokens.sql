-- ------------------------------------------------------------
-- DEVICE PUSH TOKENS - for the native Android app (Capacitor + Firebase
-- Cloud Messaging). Separate from push_subscriptions, which holds Web
-- Push subscriptions for browser/PWA users - a device can have a token
-- in one table, the other, or (rare) both if someone uses the site in
-- a browser AND the installed app. The server checks both when sending
-- a notification/call push so nobody is missed either way.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_push_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'android',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_id_idx ON public.device_push_tokens(user_id);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own device push tokens" ON public.device_push_tokens;
CREATE POLICY "Users manage their own device push tokens" ON public.device_push_tokens FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- The server sends pushes using the service role key (bypasses RLS), so
-- it can read every token regardless of whose it is - same as
-- push_subscriptions above.

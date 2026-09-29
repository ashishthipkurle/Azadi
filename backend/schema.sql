-- ============================================================
-- Azadi FreePress — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────
-- 1. users
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'reporter', 'admin')),
    password_hash TEXT NOT NULL,
    verified    BOOLEAN NOT NULL DEFAULT FALSE,
    beat        TEXT,
    location    TEXT,
    followers   INTEGER NOT NULL DEFAULT 0,
    disabled    BOOLEAN NOT NULL DEFAULT FALSE,
    disabled_at TIMESTAMPTZ,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ──────────────────────────────────────────────
-- 2. posts
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reporter_name TEXT NOT NULL,
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'dispatch',
    location      TEXT DEFAULT 'On the ground',
    latitude      NUMERIC,
    longitude     NUMERIC,
    stats         TEXT DEFAULT 'New dispatch',
    verified      BOOLEAN NOT NULL DEFAULT FALSE,
    media         JSONB DEFAULT '[]'::jsonb,
    blocks        JSONB DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_at  TIMESTAMPTZ,
    topic         TEXT
);

CREATE INDEX idx_posts_reporter_id ON posts(reporter_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- ──────────────────────────────────────────────
-- 3. follows
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
    id           BIGSERIAL PRIMARY KEY,
    reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    supporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(reporter_id, supporter_id)
);

CREATE INDEX idx_follows_reporter_id ON follows(reporter_id);
CREATE INDEX idx_follows_supporter_id ON follows(supporter_id);

-- ──────────────────────────────────────────────
-- 4. bookmarks
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, post_id)
);

CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);

-- ──────────────────────────────────────────────
-- 5. reads (de-duped per viewer+post+day)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reads (
    id         BIGSERIAL PRIMARY KEY,
    key        TEXT NOT NULL UNIQUE,
    post_id    UUID NOT NULL,
    viewer_id  UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reads_post_id ON reads(post_id);
CREATE INDEX idx_reads_created_at ON reads(created_at);

-- ──────────────────────────────────────────────
-- 6. supports (₹7 payments via Razorpay)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supporter_id    UUID NOT NULL,
    reporter_id     UUID NOT NULL,
    amount          INTEGER NOT NULL DEFAULT 7,
    interval        TEXT NOT NULL DEFAULT 'once' CHECK (interval IN ('once', 'monthly')),
    order_id        TEXT,
    subscription_id TEXT,
    payment_id      TEXT,
    status          TEXT NOT NULL DEFAULT 'created',
    verified_at     TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supports_reporter_id ON supports(reporter_id);
CREATE INDEX idx_supports_supporter_id ON supports(supporter_id);
CREATE INDEX idx_supports_status ON supports(status);
CREATE INDEX idx_supports_order_id ON supports(order_id);
CREATE INDEX idx_supports_subscription_id ON supports(subscription_id);

-- ──────────────────────────────────────────────
-- 7. notifications
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL,
    kind         TEXT NOT NULL,
    actor_id     UUID,
    actor_name   TEXT,
    subject_id   TEXT,
    subject_kind TEXT,
    message      TEXT NOT NULL,
    read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);

-- ──────────────────────────────────────────────
-- 8. media (Mux uploads)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id     UUID NOT NULL,
    upload_id    TEXT,
    filename     TEXT,
    content_type TEXT,
    status       TEXT DEFAULT 'waiting',
    asset_id     TEXT,
    playback_id  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_upload_id ON media(upload_id);

-- ──────────────────────────────────────────────
-- 9. live_sessions
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_sessions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room          TEXT NOT NULL,
    reporter_id   UUID NOT NULL,
    reporter_name TEXT NOT NULL,
    title         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'live',
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ
);

CREATE INDEX idx_live_sessions_status ON live_sessions(status);

-- ──────────────────────────────────────────────
-- 10. moderation (reports)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id   UUID NOT NULL,
    reporter_name TEXT NOT NULL,
    post_id       UUID NOT NULL,
    reason        TEXT NOT NULL,
    note          TEXT DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'open',
    resolved_by   UUID,
    resolved_at   TIMESTAMPTZ,
    appeal_text   TEXT,
    appeal_status TEXT,
    appealed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_at  TIMESTAMPTZ,
    topic         TEXT
);

CREATE INDEX idx_moderation_status ON moderation(status);

-- ──────────────────────────────────────────────
-- 11. webhook_events (idempotency)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
    id         TEXT PRIMARY KEY,
    event      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- Aggregation helper: RPC for trending score
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION read_counts_since(cutoff TIMESTAMPTZ)
RETURNS TABLE(post_id UUID, count BIGINT) AS $$
    SELECT post_id, COUNT(*) as count
    FROM reads
    WHERE created_at >= cutoff
    GROUP BY post_id;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION support_counts_since(cutoff TIMESTAMPTZ)
RETURNS TABLE(reporter_id UUID, count BIGINT) AS $$
    SELECT reporter_id, COUNT(*) as count
    FROM supports
    WHERE status = 'verified' AND verified_at >= cutoff
    GROUP BY reporter_id;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION support_totals(reporter_ids UUID[])
RETURNS TABLE(reporter_id UUID, total BIGINT, count BIGINT) AS $$
    SELECT reporter_id, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM supports
    WHERE reporter_id = ANY(reporter_ids) AND status = 'verified'
    GROUP BY reporter_id;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION follower_counts(reporter_ids UUID[])
RETURNS TABLE(reporter_id UUID, count BIGINT) AS $$
    SELECT reporter_id, COUNT(*) as count
    FROM follows
    WHERE reporter_id = ANY(reporter_ids)
    GROUP BY reporter_id;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION top_supporters(target_reporter_id UUID, max_results INTEGER DEFAULT 5)
RETURNS TABLE(supporter_id UUID, total BIGINT, count BIGINT) AS $$
    SELECT supporter_id, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM supports
    WHERE reporter_id = target_reporter_id AND status = 'verified'
    GROUP BY supporter_id
    ORDER BY total DESC
    LIMIT max_results;
$$ LANGUAGE SQL STABLE;


-- ──────────────────────────────────────────────
-- 13. reporter_applications
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reporter_applications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    beat          TEXT NOT NULL,
    portfolio_url TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    reviewed_by   UUID,
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_at  TIMESTAMPTZ,
    topic         TEXT
);

CREATE INDEX idx_reporter_applications_status ON reporter_applications(status);

-- ──────────────────────────────────────────────
-- 14. audit_log
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id    UUID NOT NULL,
    admin_name  TEXT NOT NULL,
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    details     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);


-- ============================================================
-- Disable RLS on all tables (backend uses service_role key)
-- ============================================================
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE follows DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks DISABLE ROW LEVEL SECURITY;
ALTER TABLE reads DISABLE ROW LEVEL SECURITY;
ALTER TABLE supports DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE media DISABLE ROW LEVEL SECURITY;
ALTER TABLE live_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE moderation DISABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Grant full access to anon and authenticated roles
-- (needed when using the anon key instead of service_role key)
-- ============================================================
GRANT ALL ON TABLE users TO anon, authenticated;
GRANT ALL ON TABLE posts TO anon, authenticated;
GRANT ALL ON TABLE follows TO anon, authenticated;
GRANT ALL ON TABLE bookmarks TO anon, authenticated;
GRANT ALL ON TABLE reads TO anon, authenticated;
GRANT ALL ON TABLE supports TO anon, authenticated;
GRANT ALL ON TABLE notifications TO anon, authenticated;
GRANT ALL ON TABLE media TO anon, authenticated;
GRANT ALL ON TABLE live_sessions TO anon, authenticated;
GRANT ALL ON TABLE moderation TO anon, authenticated;
GRANT ALL ON TABLE webhook_events TO anon, authenticated;
GRANT ALL ON TABLE comments TO anon, authenticated;
GRANT ALL ON TABLE push_tokens TO anon, authenticated;

-- Grant sequence usage for auto-increment columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Grant execute on all RPC functions
GRANT EXECUTE ON FUNCTION read_counts_since(TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION support_counts_since(TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION support_totals(UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION follower_counts(UUID[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION top_supporters(UUID, INTEGER) TO anon, authenticated;

-- ============================================================
-- Phase 1 Migrations: Comments & Push Tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name   TEXT NOT NULL,
    body        TEXT NOT NULL,
    parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);

CREATE TABLE IF NOT EXISTS push_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    platform    TEXT DEFAULT 'expo',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
    ) STORED;
CREATE INDEX IF NOT EXISTS idx_posts_search ON posts USING gin(search_vector);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_sent BOOLEAN DEFAULT FALSE;

-- ============================================================
-- Phase 2 Migrations: Edit Post & Profile
-- ============================================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';

CREATE OR REPLACE FUNCTION increment_comment_count(p_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_comment_count(p_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;


ALTER TABLE reporter_applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;


-- Phase 2: Direct Messaging
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;


-- ──────────────────────────────────────────────
-- Phase 3: Friend Requests
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(sender_id, receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────
-- Phase 4: E2EE and Anonymity
-- ──────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key_updated_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS codename TEXT;

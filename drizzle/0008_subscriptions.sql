-- Full subscription profile (one row per user who has or had a paid/dev grant).
-- Fast FE fields stay on users: subscription_status, subscription_expires_at.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'payment',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  first_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  last_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  subscribed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_source ON subscriptions(source);

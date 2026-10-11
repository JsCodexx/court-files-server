-- Paid plan access (Monthly / Yearly). Free tier allows 10 cases without this.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

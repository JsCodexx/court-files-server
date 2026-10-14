-- Subscription state lives on users + payments; these tables were redundant.
DROP TABLE IF EXISTS subscription_periods;
DROP TABLE IF EXISTS user_subscriptions;

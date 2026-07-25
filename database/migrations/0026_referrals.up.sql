ALTER TABLE user_profiles ADD COLUMN referral_code varchar(12) UNIQUE;

-- One row per referred signup. A user can only be referred once (they can't
-- retroactively attach a code after registering under a different one).
-- Reward is granted once, on the referred user's email verification, not on
-- signup itself, so an abandoned/unverified account never pays out.
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz
);
CREATE INDEX referrals_referrer_id ON referrals (referrer_user_id);

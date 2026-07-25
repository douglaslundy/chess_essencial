-- SP-I: a subscription now goes through a 'pending' state between checkout
-- creation (we redirect the user to Mercado Pago) and webhook confirmation
-- (Mercado Pago tells us the preapproval was authorized). The existing
-- partial unique index only covers status='active', so a pending row never
-- blocks a later active one.
ALTER TABLE user_subscriptions DROP CONSTRAINT user_subscriptions_status_check;
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'canceled', 'expired'));

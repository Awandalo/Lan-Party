-- DESTRUCTIVE DEV-ONLY OPERATION: never an automatically applied migration.
-- Target: lan-party-dev / a3c4cea6-ceb7-43b8-b9b7-b374726b35b4 / EU.
-- Requires separate exact-file owner approval, quiet window, identity confirmation,
-- migration 0016 and a fresh privately retained D1 Time Travel checkpoint.
-- Delete disposable application data. Preserve migration history, static RBAC,
-- immutable member-number tombstones/sequence and provider sending/rate budgets.
-- No DROP objects, disabling constraints, sequence reset or credential output.

DELETE FROM user_password_credentials;
DELETE FROM user_roles;
DELETE FROM registration_days;
DELETE FROM event_days;
DELETE FROM registrations;
DELETE FROM events;
DELETE FROM locations;
DELETE FROM news_articles;
DELETE FROM user_nicknames;
DELETE FROM auth_action_tokens;
DELETE FROM auth_mfa_recovery_codes;
DELETE FROM auth_recent_authentication;
DELETE FROM auth_mfa_transactions;
DELETE FROM auth_session_mfa;
DELETE FROM auth_totp_factors;
DELETE FROM auth_mfa_recovery_operations;
DELETE FROM auth_mfa_regeneration_operations;
DELETE FROM auth_sessions;
DELETE FROM users;
DELETE FROM name_prefixes;

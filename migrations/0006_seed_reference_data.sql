-- Reference data only. Fixed application-generated UUIDs are stable across environments.
-- Timestamp: 2026-10-12 00:00:00 UTC (1791763200).
-- Plain INSERTs intentionally fail on conflicts; never overwrite customized data.
INSERT INTO roles (id, code, name, description, is_active, created_at, updated_at) VALUES
  ('193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f', 'user', 'User', 'Standard LAN Party participant.', 1, 1791763200, 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'admin', 'Administrator', 'Website administration.', 1, 1791763200, 1791763200);

INSERT INTO permissions (id, code, description, created_at) VALUES
  ('42bbb9f0-a71a-4ca7-8418-0190d4d4535d', 'events.create', 'Create LAN events.', 1791763200),
  ('d2abe66d-46e2-4575-bdd9-f9f608c417d2', 'events.update', 'Edit LAN event details.', 1791763200),
  ('a021f6a6-1af8-460c-a844-bf05aca5f442', 'events.publish', 'Publish LAN events.', 1791763200),
  ('2b6a633c-303c-41ea-994f-6e73e809494b', 'events.cancel', 'Cancel LAN events.', 1791763200),
  ('c6d3249a-0008-4dd4-a434-15734dd8cfd8', 'events.manage_registrations', 'Manage participant event registrations.', 1791763200),
  ('ad64c7cd-9571-4fed-86f9-8bb0620d684d', 'locations.manage', 'Manage reusable event locations.', 1791763200),
  ('5217db7d-a756-4aa3-9fbf-2c5bf03ba335', 'users.view', 'View private user profiles.', 1791763200),
  ('111a0134-3e31-4461-9ea6-9209abb49fc6', 'users.manage', 'Manage user accounts.', 1791763200),
  ('f5cb7069-c601-4866-9b94-753e8bbbde96', 'roles.manage', 'Manage roles and permission assignments.', 1791763200),
  ('be24fe84-8d34-41c2-b84c-4d240ade3bdf', 'news.create', 'Create news articles.', 1791763200),
  ('0f39f141-74bb-4c23-b659-d4ec9f74cb8f', 'news.update', 'Edit news articles.', 1791763200),
  ('ab2dbcf9-b310-49ee-b6ab-10b7557b5b13', 'news.publish', 'Publish news articles.', 1791763200),
  ('f8eaf9c2-134b-4832-a17f-569de37d6f0e', 'news.archive', 'Archive news articles.', 1791763200);

-- Explicit grants only; role names do not grant implicit privileges.
INSERT INTO role_permissions (role_id, permission_id, granted_at) VALUES
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', '42bbb9f0-a71a-4ca7-8418-0190d4d4535d', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'd2abe66d-46e2-4575-bdd9-f9f608c417d2', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'a021f6a6-1af8-460c-a844-bf05aca5f442', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', '2b6a633c-303c-41ea-994f-6e73e809494b', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'c6d3249a-0008-4dd4-a434-15734dd8cfd8', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'ad64c7cd-9571-4fed-86f9-8bb0620d684d', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', '5217db7d-a756-4aa3-9fbf-2c5bf03ba335', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', '111a0134-3e31-4461-9ea6-9209abb49fc6', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'f5cb7069-c601-4866-9b94-753e8bbbde96', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'be24fe84-8d34-41c2-b84c-4d240ade3bdf', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', '0f39f141-74bb-4c23-b659-d4ec9f74cb8f', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'ab2dbcf9-b310-49ee-b6ab-10b7557b5b13', 1791763200),
  ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7', 'f8eaf9c2-134b-4832-a17f-569de37d6f0e', 1791763200);

-- No users, user_roles, future roles, name prefixes or credentials are seeded.
-- First-administrator provisioning requires a separate approved process.

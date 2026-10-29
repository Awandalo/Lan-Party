// Immutable seeded identity, never a display name or an editable role code.
export const ADMIN_ROLE_ID='1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7';
export const USER_ROLE_ID='193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f';
export function administratorPredicate(user='u',clock='unixepoch()') {
 return `${user}.status='active' AND ${user}.email_verified_at IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM account_lifecycle al WHERE al.user_id=${user}.id)
 AND EXISTS(SELECT 1 FROM user_roles ar JOIN roles br ON br.id=ar.role_id
 WHERE ar.user_id=${user}.id AND br.id='${ADMIN_ROLE_ID}' AND br.is_active=1 AND ar.assigned_at<=${clock})`;
}
export const PROTECTED_PERMISSIONS=['roles.manage','roles.protect_admin','users.manage','users.view'] as const;

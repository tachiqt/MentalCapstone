const MOBILE_ROLES = ['teacher', 'caretaker', 'parent'] as const;

export type MobileRole = (typeof MOBILE_ROLES)[number];

const ROLE_HOME: Record<MobileRole, string> = {
  teacher: '/(app)/(teacher)',
  caretaker: '/(app)/(caretaker)/today',
  parent: '/(app)/(parent)/progress',
};

export function isMobileRole(role: string): role is MobileRole {
  const normalized = role?.toLowerCase?.() ?? role;
  return MOBILE_ROLES.includes(normalized as MobileRole);
}

export function getRoleHomePath(role: string): string {
  const normalized = (role?.toLowerCase?.() ?? role) as MobileRole;
  if (normalized === 'parent') {
    return '/(app)/(parent)/progress';
  }
  if (isMobileRole(normalized)) {
    return ROLE_HOME[normalized];
  }
  return '/(auth)/login';
}

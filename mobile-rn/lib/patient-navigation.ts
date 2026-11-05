export type MobileCareRole = 'teacher' | 'parent' | 'caretaker' | string;

/**
 * Back from a child profile should return to that role's list/home,
 * never to a previously stacked patient profile.
 */
export function resolveChildBackTarget(role: MobileCareRole): string {
  switch (role) {
    case 'parent':
      return '/(app)/(parent)/progress';
    case 'caretaker':
      return '/(app)/(caretaker)/children';
    case 'teacher':
    default:
      return '/(app)/(teacher)';
  }
}

/**
 * Opening patient B while already on patient A should replace the route
 * so history does not stack A → B.
 */
export function shouldReplaceChildRoute(currentChildId: string | number | null | undefined, nextChildId: string | number): boolean {
  if (currentChildId === null || currentChildId === undefined || currentChildId === '') {
    return false;
  }
  return String(currentChildId) !== String(nextChildId);
}

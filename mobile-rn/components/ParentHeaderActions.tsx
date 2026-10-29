import { HeaderActions } from './HeaderActions';

/** Parent tabs: notifications only — profile lives in bottom tab bar. */
export function ParentHeaderActions() {
  return <HeaderActions showProfile={false} />;
}

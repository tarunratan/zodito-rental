import { hasClerkKeys } from '@/lib/mock';
import { ClerkNav } from './ClerkNav';
import { MockNav } from './MockNav';

/** Picks the right nav based on whether Clerk is configured. Server component. */
export function Nav() {
  return hasClerkKeys() ? <ClerkNav /> : <MockNav />;
}

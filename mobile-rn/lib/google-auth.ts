import type * as GoogleSigninModule from '@react-native-google-signin/google-signin';

/**
 * The Web client ID, not the Android one. Google issues the ID token with this
 * as its audience, which is exactly what the backend checks in
 * AuthController::googleLogin. The Android OAuth client still has to exist in
 * the same Google Cloud project (matching the package name and the signing
 * SHA-1) or the native sign-in fails with DEVELOPER_ERROR before we get here.
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ||
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
  '';

export const isGoogleConfigured = GOOGLE_WEB_CLIENT_ID.length > 0;

export class GoogleSignInError extends Error {}

/** Thrown when the user backs out; callers should stay silent. */
export class GoogleSignInCancelled extends Error {}

/**
 * The native module is absent in Expo Go and in any build that did not compile
 * it. Requiring it at module scope took the whole app down with a TurboModule
 * invariant before a single screen rendered, so it is resolved on demand and a
 * missing module simply means Google sign-in is unavailable.
 */
function loadNativeModule(): typeof GoogleSigninModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin');
    return mod?.GoogleSignin ? mod : null;
  } catch {
    return null;
  }
}

let cached: typeof GoogleSigninModule | null | undefined;

function nativeModule(): typeof GoogleSigninModule | null {
  if (cached === undefined) cached = loadNativeModule();
  return cached;
}

/** True only when the ID is set *and* the native module is in this binary. */
export const isGoogleAvailable = isGoogleConfigured && nativeModule() !== null;

let configured = false;

function ensureConfigured(mod: typeof GoogleSigninModule) {
  if (configured) return;
  mod.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Runs the native Google flow and returns the ID token to hand to the backend.
 * Requires a real build — the native module is not present in Expo Go.
 */
export async function getGoogleIdToken(): Promise<string> {
  if (!isGoogleConfigured) {
    throw new GoogleSignInError(
      'Google sign-in is not configured in this build. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and rebuild.'
    );
  }

  const mod = nativeModule();
  if (!mod) {
    throw new GoogleSignInError(
      'Google sign-in needs the installed app. Sign in with your username and password here.'
    );
  }

  const { GoogleSignin, statusCodes } = mod;
  ensureConfigured(mod);

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    if (response.type === 'cancelled') {
      throw new GoogleSignInCancelled('cancelled');
    }

    const idToken = response.data?.idToken;
    if (!idToken) {
      throw new GoogleSignInError('Google did not return an ID token. Try again.');
    }

    return idToken;
  } catch (err: any) {
    if (err instanceof GoogleSignInCancelled || err instanceof GoogleSignInError) throw err;

    const code = String(err?.code ?? '');

    if (code === statusCodes.SIGN_IN_CANCELLED) {
      throw new GoogleSignInCancelled('cancelled');
    }
    if (code === statusCodes.IN_PROGRESS) {
      throw new GoogleSignInError('A Google sign-in is already in progress.');
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new GoogleSignInError(
        'Google Play Services is unavailable or out of date on this device.'
      );
    }
    // Play Services status 10. The library stopped exporting a constant for it,
    // but the native layer still rejects with this code when the Android OAuth
    // client is missing or its package name / signing certificate do not match
    // this build. It is the single most common Google setup mistake, so name it.
    if (code === 'DEVELOPER_ERROR' || code === '10') {
      throw new GoogleSignInError(
        "This build is not registered with Google. The Android OAuth client needs this app's package name and signing SHA-1 fingerprint."
      );
    }

    throw new GoogleSignInError(err?.message || 'Unable to sign in with Google. Try again.');
  }
}

/**
 * Clears the cached Google account so the next attempt shows the picker again.
 * Signing out of SmartCare should not silently re-use the last Google account.
 */
export async function signOutFromGoogle(): Promise<void> {
  const mod = nativeModule();
  if (!isGoogleConfigured || !mod) return;
  try {
    ensureConfigured(mod);
    await mod.GoogleSignin.signOut();
  } catch {
    // Never block SmartCare logout on Google's session state.
  }
}

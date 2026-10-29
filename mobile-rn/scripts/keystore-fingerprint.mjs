/**
 * Prints the SHA-1 of each EAS Android build credential so the fingerprint can
 * be registered as an Android OAuth client in Google Cloud Console.
 *
 * `eas credentials` is interactive-only, so this reads the CLI's stored session
 * and asks the Expo API directly.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const projectId = process.argv[2];
if (!projectId) {
  console.error('usage: node scripts/keystore-fingerprint.mjs <eas-project-id>');
  process.exit(1);
}

const state = JSON.parse(readFileSync(join(homedir(), '.expo', 'state.json'), 'utf8'));
const sessionSecret = state?.auth?.sessionSecret;
if (!sessionSecret) {
  console.error('No Expo session found. Run `eas login` first.');
  process.exit(1);
}

const query = `
  query AndroidCredentials($appId: String!) {
    app {
      byId(appId: $appId) {
        slug
        androidAppCredentials {
          applicationIdentifier
          androidAppBuildCredentialsList {
            name
            isDefault
            androidKeystore {
              keyAlias
              md5CertificateFingerprint
              sha1CertificateFingerprint
              sha256CertificateFingerprint
            }
          }
        }
      }
    }
  }
`;

const res = await fetch('https://api.expo.dev/graphql', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'expo-session': sessionSecret,
  },
  body: JSON.stringify({ query, variables: { appId: projectId } }),
});

const json = await res.json();
if (json.errors) {
  console.error(JSON.stringify(json.errors, null, 2));
  process.exit(1);
}

const app = json.data?.app?.byId;
console.log(`app: ${app?.slug}`);
for (const creds of app?.androidAppCredentials ?? []) {
  console.log(`\npackage: ${creds.applicationIdentifier}`);
  for (const build of creds.androidAppBuildCredentialsList ?? []) {
    const k = build.androidKeystore ?? {};
    console.log(`  profile credential: ${build.name}${build.isDefault ? ' (default)' : ''}`);
    console.log(`    key alias: ${k.keyAlias}`);
    console.log(`    SHA-1:     ${k.sha1CertificateFingerprint}`);
    console.log(`    SHA-256:   ${k.sha256CertificateFingerprint}`);
  }
}

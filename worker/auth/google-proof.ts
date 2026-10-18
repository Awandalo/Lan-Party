import { toHex } from './encoding';
import { isValidToken } from './tokens';
// Separate from verification/reset proofs, even though storage is also isolated.
export async function googleProof(value: string) {
  if (!isValidToken(value)) throw new Error('Invalid Google proof');
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('lan-party:google-context:v1:'+value))));
}

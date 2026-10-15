// AES-GCM encryption helpers for Meta credentials.
// The key comes from META_TOKEN_ENC_KEY (any string; hashed to 256 bits).

async function getKey(envVar: string = "META_TOKEN_ENC_KEY"): Promise<CryptoKey> {
  const raw = Deno.env.get(envVar);
  if (!raw) throw new Error(`${envVar} is not configured`);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string, envVar?: string): Promise<string> {
  const key = await getKey(envVar);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptSecret(payload: string, envVar?: string): Promise<string> {
  const key = await getKey(envVar);
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const cipher = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}
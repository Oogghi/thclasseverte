import { ADMIN_VAULT } from './admin-vault.js?v=20260903_v4';

const PBKDF2_ITERATIONS = 250000;

// Convert Uint8Array to Base64
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to Uint8Array
export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a password and salt using PBKDF2.
 */
async function deriveAesKey(password, saltBuffer, usage = ['encrypt', 'decrypt']) {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

/**
 * Encrypts a plaintext string (e.g. API key) using a password.
 * Returns a JSON-serializable vault: { salt, iv, ciphertext }.
 */
export async function encryptSecret(plainText, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, ['encrypt']);

  const encoder = new TextEncoder();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText)
  );

  return {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
  };
}

/**
 * Decrypts a vault using a password.
 * Throws an OperationError if the password is incorrect (AES-GCM authentication tag mismatch).
 */
export async function decryptSecret(vault, password) {
  if (!vault || !vault.salt || !vault.iv || !vault.ciphertext) {
    throw new Error('Coffre-fort invalide ou non configuré');
  }

  const salt = base64ToBuffer(vault.salt);
  const iv = base64ToBuffer(vault.iv);
  const ciphertext = base64ToBuffer(vault.ciphertext);

  const key = await deriveAesKey(password, salt, ['decrypt']);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Validates the password against the configured ADMIN_VAULT.
 * If successful, stores the decrypted admin write key in sessionStorage and returns true.
 * If failed, returns false.
 */
const SESSION_PERSIST_KEY = 'th_admin_session_v1';
const SESSION_DURATION_DAYS = 14;

/**
 * Validates the password against the configured ADMIN_VAULT.
 * If successful, stores the decrypted admin write key in memory and persists the session.
 */
export async function loginAdmin(password, rememberMe = true) {
  try {
    const trimmed = (password || '').trim();
    const apiKey = await decryptSecret(ADMIN_VAULT, trimmed);
    if (apiKey && apiKey.startsWith('$2a$')) {
      sessionStorage.setItem('adminKey', apiKey);

      if (rememberMe) {
        const payload = {
          key: apiKey,
          expiresAt: Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
        };
        try {
          localStorage.setItem(SESSION_PERSIST_KEY, JSON.stringify(payload));
        } catch (_) {}
      }

      return true;
    }
    console.warn('[AUTH] Clé déchiffrée invalide');
    return false;
  } catch (err) {
    console.error('[AUTH] Échec déchiffrement (mot de passe incorrect ou coffre corrompu):', err);
    return false;
  }
}

/**
 * Returns the decrypted admin key from memory, or from valid persisted session.
 */
export function getAdminKey() {
  // 1. Active tab memory
  const memoryKey = sessionStorage.getItem('adminKey');
  if (memoryKey && memoryKey.startsWith('$2a$')) return memoryKey;

  // 2. Persisted device session
  try {
    const stored = localStorage.getItem(SESSION_PERSIST_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (data && data.key && data.expiresAt > Date.now()) {
        sessionStorage.setItem('adminKey', data.key);
        return data.key;
      } else {
        localStorage.removeItem(SESSION_PERSIST_KEY);
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Checks if the admin is currently authenticated in this session.
 */
export function isAdminLoggedIn() {
  return Boolean(getAdminKey());
}

/**
 * Clears the session credentials from both memory and local storage.
 */
export function logoutAdmin() {
  sessionStorage.removeItem('adminKey');
  try {
    localStorage.removeItem(SESSION_PERSIST_KEY);
  } catch (_) {}
}

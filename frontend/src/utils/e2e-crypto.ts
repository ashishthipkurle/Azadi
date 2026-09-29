import { storage } from "@/src/utils/storage";
import { Platform } from 'react-native';

/**
 * Azadi E2EE Crypto Module
 * Uses standard Web Crypto API / SubtleCrypto for RSA-OAEP.
 * 
 * On Expo Web: window.crypto.subtle is available natively.
 * On React Native: requires a polyfill. Add this to your app entry (_layout.tsx):
 *   import { install } from 'react-native-quick-crypto';
 *   install();
 * Or use expo-crypto for basic operations.
 */

const KEY_ALIAS = 'azadi_e2ee_private_key_';
const PUB_KEY_ALIAS = 'azadi_e2ee_public_key_';

function getCryptoSubtle(): SubtleCrypto {
  // 1. Check for react-native-quick-crypto polyfill (installed globally)
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto?.subtle) {
    return (globalThis as any).crypto.subtle;
  }
  // 2. Check for standard browser/web crypto
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle;
  }
  // 3. Not available — give a helpful error
  if (Platform.OS !== 'web') {
    throw new Error(
      "SubtleCrypto is not available on this device. " +
      "Install react-native-quick-crypto: npm install react-native-quick-crypto, " +
      "then add to your _layout.tsx: import { install } from 'react-native-quick-crypto'; install();"
    );
  }
  throw new Error("SubtleCrypto not available.");
}

export async function generateKeyPair(userId: string): Promise<void> {
  const subtle = getCryptoSubtle();
  const keyPair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // Extractable so we can export and save it
    ["encrypt", "decrypt"]
  );

  // Export keys
  const privateKeyJwk = await subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyJwk = await subtle.exportKey("jwk", keyPair.publicKey);

  // Save to hardware-backed SecureStore
  await storage.secureSet(KEY_ALIAS + userId, JSON.stringify(privateKeyJwk));
  await storage.secureSet(PUB_KEY_ALIAS + userId, JSON.stringify(publicKeyJwk));
}

export async function getMyPublicKey(userId: string): Promise<string | null> {
  const pubJwk = await storage.secureGet<string | null>(PUB_KEY_ALIAS + userId, null);
  return pubJwk ? pubJwk : null;
}

export async function encryptMessage(text: string, recipientPublicKeyJwkStr: string): Promise<string> {
  const subtle = getCryptoSubtle();
  const recipientJwk = JSON.parse(recipientPublicKeyJwkStr);
  
  const publicKey = await subtle.importKey(
    "jwk",
    recipientJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  const encodedText = new TextEncoder().encode(text);
  const encryptedBuf = await subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    encodedText
  );

  // Convert ArrayBuffer to Base64
  return arrayBufferToBase64(encryptedBuf);
}

export async function decryptMessage(base64Ciphertext: string, userId: string): Promise<string> {
  const subtle = getCryptoSubtle();
  
  // Load private key from SecureStore
  const privateKeyJwkStr = await storage.secureGet<string | null>(KEY_ALIAS + userId, null);
  if (!privateKeyJwkStr) {
    throw new Error("No private key found on device");
  }

  const privateKeyJwk = JSON.parse(privateKeyJwkStr);
  const privateKey = await subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );

  const encryptedBuf = base64ToArrayBuffer(base64Ciphertext);
  
  const decryptedBuf = await subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedBuf
  );

  return new TextDecoder().decode(decryptedBuf);
}

// Helpers
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa !== 'undefined') return btoa(binary);
  // RN fallback
  const Buffer = require('buffer').Buffer;
  return Buffer.from(buffer).toString('base64');
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof atob !== 'undefined') {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
  // RN fallback
  const Buffer = require('buffer').Buffer;
  return Buffer.from(base64, 'base64').buffer;
}

import { useState, useEffect, useCallback } from 'react';
import * as E2ECrypto from '../utils/e2e-crypto';
import { apiGet, apiPost } from '../api';
import { useAuth } from '../auth';

export function useE2EE() {
  const [isReady, setIsReady] = useState(false);
  const [hasE2EE, setHasE2EE] = useState(false);
  const [publicKeysCache, setPublicKeysCache] = useState<Record<string, string>>({});
  const { user } = useAuth();

  useEffect(() => {
    async function initKeys() {
      if (!user?.id) return;
      try {
        let pubKey = await E2ECrypto.getMyPublicKey(user.id);
        if (!pubKey) {
          console.log("Generating new E2EE keypair for user:", user.id);
          await E2ECrypto.generateKeyPair(user.id);
          pubKey = await E2ECrypto.getMyPublicKey(user.id);
          
          if (pubKey) {
            // Upload to server
            await apiPost('/e2ee/keys', { public_key: pubKey });
          }
        }
        setHasE2EE(true);
      } catch (err) {
        console.warn("E2EE SubtleCrypto not available on this platform, falling back to server encryption:", err);
        setHasE2EE(false);
      } finally {
        setIsReady(true);
      }
    }
    initKeys();
  }, [user?.id]);

  const encrypt = useCallback(async (text: string, recipientId: string): Promise<string> => {
    let recipientKey = publicKeysCache[recipientId];
    if (!recipientKey) {
      // Fetch from server
      const res = await apiGet<any>(`/e2ee/keys/${recipientId}`);
      if (res && res.public_key) {
        recipientKey = res.public_key;
        setPublicKeysCache(prev => ({ ...prev, [recipientId]: recipientKey }));
      } else {
        throw new Error("Recipient does not have a public key setup.");
      }
    }
    
    return await E2ECrypto.encryptMessage(text, recipientKey);
  }, [publicKeysCache]);

  const decrypt = useCallback(async (ciphertext: string): Promise<string> => {
    if (!user?.id) throw new Error("Not logged in");
    return await E2ECrypto.decryptMessage(ciphertext, user.id);
  }, [user?.id]);

  return { isReady, hasE2EE, encrypt, decrypt };
}

import type { SignInPayload } from '@wallet-ui/react-native-web3js';
import { createWalletSignInPayloadFields } from '../../shared/walletAuth';

export const createWalletSignInPayload = (nonce: string): SignInPayload => {
  return createWalletSignInPayloadFields(nonce, new Date().toISOString());
};

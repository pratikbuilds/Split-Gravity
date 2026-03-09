import { fromUint8Array, type SignInOutput } from '@wallet-ui/react-native-web3js';
import type { WalletVerifyRequest } from '../../shared/payment-contracts';

export const createWalletVerifyRequest = ({
  nonce,
  signInResult,
}: {
  nonce: string;
  signInResult: SignInOutput;
}): WalletVerifyRequest => ({
  nonce,
  signature: fromUint8Array(signInResult.signature),
  signedMessage: fromUint8Array(signInResult.signedMessage),
});

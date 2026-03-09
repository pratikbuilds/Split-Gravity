import { fromUint8Array, toUint8Array, type SignInOutput } from '@wallet-ui/react-native-web3js';
import type { WalletVerifyRequest } from '../../shared/payment-contracts';

const textDecoder = new TextDecoder();

const decodeMaybeBase64Text = (value: Uint8Array) => {
  const text = textDecoder.decode(value).trim();
  if (!text) {
    return value;
  }

  try {
    return toUint8Array(text);
  } catch {
    return value;
  }
};

export const createWalletVerifyRequest = ({
  nonce,
  signInResult,
}: {
  nonce: string;
  signInResult: SignInOutput;
}): WalletVerifyRequest => ({
  nonce,
  signature: fromUint8Array(decodeMaybeBase64Text(signInResult.signature)),
  signedMessage: fromUint8Array(decodeMaybeBase64Text(signInResult.signedMessage)),
});

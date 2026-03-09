# Wallet Sign-In VerifySignIn Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the custom wallet nonce/signature verification flow with a server-issued SIWS challenge verified via `verifySignIn()`.

**Architecture:** The backend will issue a full sign-in challenge bound to the connected wallet address and persist it by nonce. The client will request that challenge, call `signIn(challenge.signInPayload)`, and send only the nonce plus signed output bytes back for backend verification using the stored challenge.

**Tech Stack:** Expo React Native, `@wallet-ui/react-native-web3js`, Solana wallet-standard util, Express, TypeScript

---

### Task 1: Update shared wallet-auth contracts

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/shared/payment-contracts.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/shared/payment-contracts.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/shared/walletAuth.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/shared/walletAuth.ts`

**Step 1:** Replace nonce-only auth types with a server-issued `WalletSignInPayload` and `WalletChallengeResponse`.

**Step 2:** Make the payload helper produce a complete challenge bound to a wallet address.

### Task 2: Replace custom verifier with `verifySignIn()`

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/payments/auth.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/payments/service.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/payments/routes.ts`

**Step 1:** Rename nonce records to challenge records and persist the full payload by nonce.

**Step 2:** Add a challenge issuance method that accepts a wallet address and creates the SIWS input on the server.

**Step 3:** Verify the signed output with `verifySignIn()` using the stored payload instead of reconstructing the message manually.

### Task 3: Update the mobile client auth flow

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/services/backend/api.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/components/PaidModeSetupScreen.tsx`
- Modify: `/Users/pratik/development/mobile/my-expo-app/utils/wallet/auth.ts`

**Step 1:** Replace `createWalletNonce()` with `createWalletChallenge(walletAddress)`.

**Step 2:** Serialize the `signIn()` output into the new verify request shape.

**Step 3:** Keep the existing payment flow and error reporting intact.

### Task 4: Update tests and verify behavior

**Files:**
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/tests/paymentsAuth.test.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/tests/paymentFlow.e2e.test.ts`
- Modify: `/Users/pratik/development/mobile/my-expo-app/server/src/tests/runtimePersistence.test.ts`

**Step 1:** Rewrite test setup to request a server-issued challenge and sign that payload.

**Step 2:** Run targeted server tests.

**Step 3:** Run server typecheck.

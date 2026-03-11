# Home Screen Wallet Sheet Design

**Date:** 2026-03-11
**Scope:** Main home screen wallet connect, disconnect, and wallet switching flow.

## Goals

- Provide obvious wallet management from the home screen without competing with gameplay CTAs.
- Support connect, disconnect, and change-wallet flows from one place.
- Keep the UI polished and lightweight with no new dependency.

## Recommended Approach

Use a compact pressable wallet trigger in the top-right header that opens a custom bottom sheet modal.

### Why this approach

- Preserves `Solo Run` and `Multiplayer` as the primary focus.
- Exposes the wallet as a real control rather than a passive status chip.
- Avoids introducing a new sheet library for one interaction.

## UI

### Header trigger

- Replace the current passive wallet chip with a pressable trigger.
- Disconnected state:
  - Label: `Connect Wallet`
  - Subtle dark glass background with a bordered accent.
- Connected state:
  - Shortened wallet address
  - Green status dot
  - Slightly richer accent treatment to read as an active account control.

### Bottom sheet

- Uses React Native `Modal` with a dimmed backdrop.
- Bottom anchored panel with rounded top corners.
- Safe-area aware bottom padding.
- Content order:
  1. Title row with close affordance
  2. Wallet account summary card
  3. Session/auth status row
  4. Action buttons
  5. Inline feedback/error area

## Behavior

- `Connect Wallet`
  - Opens the wallet provider connect flow.
  - Closes the sheet on success.
- `Disconnect`
  - Clears stored wallet session.
  - Disconnects the wallet provider.
  - Closes the sheet on success.
- `Change Wallet`
  - Clears stored session first.
  - Disconnects the active provider session.
  - Re-opens provider connect flow to let the user choose a new wallet/account.
  - Closes the sheet on success.

## State and Data Flow

- `useWalletSession` remains the main integration point for:
  - current wallet account
  - stored backend auth session
  - `connect`, `disconnect`, and signing methods from the provider
- Add a convenience `switchWallet` helper to keep sheet UI logic simple.
- Existing session invalidation on wallet-address change remains intact.

## Files

- Modify: `hooks/useWalletSession.ts`
- Replace usage in: `components/HomeScreen.tsx`
- Add: `components/wallet/WalletMenuTrigger.tsx`
- Add: `components/wallet/WalletSheet.tsx`

## Testing

- Confirm disconnected trigger opens the sheet and connects successfully.
- Confirm connected state shows the shortened address.
- Confirm disconnect clears both wallet provider session and stored app session.
- Confirm change-wallet flow can disconnect and reconnect to a different account.
- Run `pnpm lint`.

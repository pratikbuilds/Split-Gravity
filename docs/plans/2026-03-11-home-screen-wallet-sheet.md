# Home Screen Wallet Sheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a polished wallet management sheet to the home screen with connect, disconnect, and change-wallet actions.

**Architecture:** Keep wallet state in `useWalletSession`, expose a small helper for switching wallets, and compose a new trigger plus bottom sheet in the home screen header. Use React Native primitives only so the flow fits the existing app without adding dependencies.

**Tech Stack:** Expo, React Native, NativeWind, `@wallet-ui/react-native-web3js`, AsyncStorage

---

### Task 1: Document wallet session actions

**Files:**

- Modify: `hooks/useWalletSession.ts`

**Step 1: Write the failing test**

No automated test exists for this hook today. Verify behavior manually after implementation.

**Step 2: Run test to verify it fails**

Skipped. No existing hook test harness in this app.

**Step 3: Write minimal implementation**

- Add a `disconnectWallet` helper that clears local session storage and disconnects the provider.
- Add a `switchWallet` helper that clears local session, disconnects the provider, then reconnects.

**Step 4: Run test to verify it passes**

Manual validation in the home screen wallet sheet.

**Step 5: Commit**

```bash
git add hooks/useWalletSession.ts
git commit -m "feat: add wallet session management helpers"
```

### Task 2: Build wallet trigger and sheet UI

**Files:**

- Create: `components/wallet/WalletMenuTrigger.tsx`
- Create: `components/wallet/WalletSheet.tsx`

**Step 1: Write the failing test**

No component test harness exists. Validate visually in the app.

**Step 2: Run test to verify it fails**

Skipped. This repository does not include RN component tests.

**Step 3: Write minimal implementation**

- Create a pressable wallet trigger with connected and disconnected variants.
- Create a modal bottom sheet with:
  - title row
  - account summary card
  - session status copy
  - `Connect Wallet`, `Change Wallet`, and `Disconnect` actions
  - inline feedback for pending and error states

**Step 4: Run test to verify it passes**

Manual validation in Expo/dev build.

**Step 5: Commit**

```bash
git add components/wallet/WalletMenuTrigger.tsx components/wallet/WalletSheet.tsx
git commit -m "feat: add home screen wallet sheet"
```

### Task 3: Wire the home screen

**Files:**

- Modify: `components/HomeScreen.tsx`

**Step 1: Write the failing test**

No automated UI test exists. Validate visually after wiring.

**Step 2: Run test to verify it fails**

Skipped. No home screen test harness exists.

**Step 3: Write minimal implementation**

- Replace the passive wallet chip with the wallet trigger.
- Manage sheet open/close state in `HomeScreen`.
- Keep the rest of the home screen hierarchy intact.

**Step 4: Run test to verify it passes**

Manual validation on the main screen.

**Step 5: Commit**

```bash
git add components/HomeScreen.tsx
git commit -m "feat: wire wallet management into home screen"
```

### Task 4: Verify and clean up

**Files:**

- Modify if needed: `components/HomeScreen.tsx`
- Modify if needed: `components/wallet/WalletSheet.tsx`
- Modify if needed: `hooks/useWalletSession.ts`

**Step 1: Write the failing test**

Use lint as the verification baseline.

**Step 2: Run test to verify it fails**

Run: `pnpm lint`

**Step 3: Write minimal implementation**

- Fix any lint or type issues from the wallet sheet integration.

**Step 4: Run test to verify it passes**

Run: `pnpm lint`
Expected: PASS with no ESLint or Prettier errors.

**Step 5: Commit**

```bash
git add hooks/useWalletSession.ts components/HomeScreen.tsx components/wallet/WalletMenuTrigger.tsx components/wallet/WalletSheet.tsx
git commit -m "feat: finish home screen wallet management flow"
```

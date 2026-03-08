const USER_REJECTED_PATTERNS = ['cancel', 'declin', 'deny', 'dismiss', 'reject'];

export function formatWalletError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') {
      return serialized;
    }
  } catch {
    // Ignore serialization failures and fall back to the default message.
  }

  return 'Unknown wallet error.';
}

export function isUserRejectedWalletError(error: unknown): boolean {
  const message = formatWalletError(error).toLowerCase();
  return USER_REJECTED_PATTERNS.some((pattern) => message.includes(pattern));
}

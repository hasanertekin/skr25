export class PrivacyLockExemption {
  private depth = 0;
  private observedActiveDuringExemption = false;
  private ignoreNextActiveUntil = 0;

  begin() {
    this.depth += 1;
    let released = false;

    return (now = Date.now()) => {
      if (released) return;
      released = true;
      this.depth = Math.max(0, this.depth - 1);
      if (this.depth === 0) {
        this.ignoreNextActiveUntil = this.observedActiveDuringExemption ? 0 : now + 2500;
        this.observedActiveDuringExemption = false;
      }
    };
  }

  shouldSkipAppState(state: string, now = Date.now()) {
    if (this.depth > 0) {
      if (state === "active") this.observedActiveDuringExemption = true;
      return true;
    }

    if (state === "active" && now <= this.ignoreNextActiveUntil) {
      this.ignoreNextActiveUntil = 0;
      return true;
    }

    if (now > this.ignoreNextActiveUntil) this.ignoreNextActiveUntil = 0;
    return false;
  }
}

export const privacyLockExemption = new PrivacyLockExemption();

export async function withPrivacyLockExemption<T>(operation: () => Promise<T>): Promise<T> {
  const release = privacyLockExemption.begin();
  try {
    return await operation();
  } finally {
    release();
  }
}

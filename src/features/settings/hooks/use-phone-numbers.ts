import { useEffect, useState } from "react";
import type { PhoneNumbersSource, PhoneNumbersView } from "../types";

// The read has its own request timeout. This only ends the "Checking" text if it never answers.
const GIVE_UP_MS = 20_000;
const FAILED: PhoneNumbersView = { state: "unavailable" };

type Shown = { loading: true } | { loading: false; phone?: PhoneNumbersView };

// Reads the promise in an effect, not with `use()`: a refresh after a save must not wait for the
// phone read, and the numbers already on screen stay until the new answer arrives.
export function usePhoneNumbers(source: PhoneNumbersSource): Shown {
  const pending = source instanceof Promise ? source : null;
  const [settled, setSettled] = useState<{ phone?: PhoneNumbersView } | null>(null);

  useEffect(() => {
    if (!pending) return;
    let current = true;
    const timer = setTimeout(() => {
      if (current) setSettled((last) => last ?? { phone: FAILED });
    }, GIVE_UP_MS);
    const finish = (phone?: PhoneNumbersView) => {
      clearTimeout(timer);
      if (current) setSettled({ phone });
    };
    pending.then(finish, () => finish(FAILED));
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [pending]);

  if (!pending) return { loading: false, phone: source as PhoneNumbersView | undefined };
  return settled ? { loading: false, phone: settled.phone } : { loading: true };
}

"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

/** Prevents duplicate form-action submissions while preserving server checks. */
export function PendingActionButton({
  children,
  pendingLabel = "Starting…",
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const submitAttempted = useRef(false);
  const observedPending = useRef(false);

  useEffect(() => {
    if (pending) {
      observedPending.current = true;
      return;
    }
    if (observedPending.current) {
      observedPending.current = false;
      submitAttempted.current = false;
    }
  }, [pending]);

  const busy = pending;

  return (
    <Button
      {...props}
      type="submit"
      disabled={props.disabled || busy}
      aria-busy={busy}
      onClick={(event) => {
        if (submitAttempted.current) {
          event.preventDefault();
          return;
        }
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          // Do not set state here: disabling the button during the click event
          // can cancel the browser's native form submission before Next.js
          // dispatches the Server Action.
          submitAttempted.current = true;
          console.info("[workflow-action-button] submit requested");
        }
      }}
    >
      {busy ? pendingLabel : children}
    </Button>
  );
}

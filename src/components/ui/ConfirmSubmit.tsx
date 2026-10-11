"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** A keyboard-accessible confirmation button for destructive server actions. */
export function ConfirmSubmit({
  message,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { message: string; children: ReactNode }) {
  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
        props.onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Accessible switch with unambiguous ON/OFF states.
 *
 * Owner runtime: the previous OFF track (bg-input, L≈0.92 on a white card)
 * was nearly invisible and the 20x36px track made state hard to read at a
 * glance. The track is enlarged, the OFF state gains a visible track + border,
 * and the ON state uses a high-contrast fill with a white thumb. Business
 * logic untouched — visual/state clarity only.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      // OFF: visible gray track with a distinct border so state is readable on
      // both white and dark surfaces; ON: strong primary fill.
      "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/30 data-[state=unchecked]:ring-1 data-[state=unchecked]:ring-input",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-1 ring-black/10 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 dark:bg-white",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };

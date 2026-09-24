import { ChevronDown } from "lucide-react";

/**
 * Wraps an existing native <select> to add appearance-none + chevron.
 * Use this to standardize selects without migrating to StyledSelect.
 *
 * Usage:
 *   <SelectChevron>
 *     <select className="..." value={...} onChange={...}>
 *       <option>...</option>
 *     </select>
 *   </SelectChevron>
 */
export function SelectChevron({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative inline-block w-full">
      {children}
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
    </div>
  );
}

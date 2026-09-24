import { useEffect, useState } from "react";

/** A draft belongs to the URL it was typed against. History navigation wins. */
export function useRouteSearchInput(url: string) {
  const [draft, setDraft] = useState({ url, value: url });
  useEffect(() => setDraft({ url, value: url }), [url]);
  return [
    draft.url === url ? draft.value : url,
    (value: string) => setDraft({ url, value }),
  ] as const;
}

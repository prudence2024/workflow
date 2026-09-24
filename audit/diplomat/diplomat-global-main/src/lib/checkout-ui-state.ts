export function quoteAmountLabel(input: {
  loading: boolean;
  error: string;
  value: number | undefined;
  format: (value: number) => string;
}): string {
  if (input.loading) return "Calculating…";
  if (input.error) return "Unavailable";
  if (input.value === undefined) return "—";
  return input.format(input.value);
}

export async function runCheckoutQuoteRequest<T>(input: {
  request: () => Promise<T>;
  onStart: () => void;
  onSuccess: (result: T) => void;
  onError: (error: unknown) => void;
  onFinish: () => void;
}): Promise<void> {
  input.onStart();
  try {
    input.onSuccess(await input.request());
  } catch (error) {
    input.onError(error);
  } finally {
    input.onFinish();
  }
}

export function canSubmitCheckout(input: {
  cartSize: number;
  hasQuote: boolean;
  loading: boolean;
  error: string;
}): boolean {
  return input.cartSize > 0 && input.hasQuote && !input.loading && !input.error;
}

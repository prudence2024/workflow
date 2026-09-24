function formatNaira(n: number): string {
  return "\u20A6" + n.toLocaleString("en-NG");
}

export function buildPaymentAlert(input: {
  amount: number;
  currency?: string;
  customerName: string;
  customerEmail: string;
  reference: string;
  status: string;
  productName?: string;
  paidAt: Date;
}): string {
  const currency = input.currency || "NGN";
  const amount = currency === "NGN" ? formatNaira(input.amount) : `${currency} ${input.amount}`;

  const statusEmoji =
    input.status === "success" || input.status === "completed"
      ? "\u2705"
      : input.status === "failed"
        ? "\u274C"
        : "\u23F3";

  const dateStr = input.paidAt.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = input.paidAt.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [
    "\uD83D\uDCB0 *PAYMENT SUCCESSFUL*",
    "",
    "Diplomat Global",
    "",
    `Customer:\n${input.customerName}`,
    `Email:\n${input.customerEmail}`,
    "",
    `Amount:\n${amount}`,
  ];

  if (input.productName) {
    lines.push(`Product:\n${input.productName}`);
  }

  lines.push(
    "",
    `Reference:\n${input.reference}`,
    `Status:\n${statusEmoji} ${input.status}`,
    "",
    `Time:\n${dateStr}, ${timeStr}`,
  );

  return lines.join("\n");
}

export function buildPaymentFailureAlert(input: {
  reference: string;
  reason?: string;
  email?: string;
  amount?: number;
}): string {
  const lines = [
    "\u274C *PAYMENT FAILED*",
    "",
    "Diplomat Global",
    "",
    `Reference: ${input.reference}`,
  ];

  if (input.email) lines.push(`Email: ${input.email}`);
  if (input.amount) lines.push(`Amount: ${formatNaira(input.amount)}`);
  if (input.reason) lines.push(`Reason: ${input.reason}`);

  return lines.join("\n");
}

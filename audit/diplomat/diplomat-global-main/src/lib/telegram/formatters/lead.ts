export function buildContactAlert(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): string {
  const truncatedMsg =
    input.message.length > 200 ? input.message.substring(0, 200) + "..." : input.message;

  return [
    "\uD83D\uDCE9 *NEW CONTACT*",
    "",
    `Name:\n${input.name || "Anonymous"}`,
    `Email:\n${input.email}`,
    `Subject:\n${input.subject || "No subject"}`,
    "",
    `Message:\n${truncatedMsg}`,
  ].join("\n");
}

export function buildLeadAlert(input: { name?: string; email: string; source?: string }): string {
  return [
    "\uD83D\uDE80 *NEW LEAD*",
    "",
    `Name:\n${input.name || "Not provided"}`,
    `Email:\n${input.email}`,
    `Source:\n${input.source || "Newsletter signup"}`,
  ].join("\n");
}

export function buildOrderAlert(input: {
  orderNumber: string;
  customerName: string;
  total: number;
  currency?: string;
  status: string;
  createdAt: Date;
}): string {
  const currency = input.currency || "NGN";
  const amount =
    currency === "NGN"
      ? "\u20A6" + input.total.toLocaleString("en-NG")
      : `${currency} ${input.total}`;

  const dateStr = input.createdAt.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = input.createdAt.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    "\uD83D\uDED2 *NEW ORDER*",
    "",
    `Order:\n#${input.orderNumber}`,
    `Customer:\n${input.customerName}`,
    `Total:\n${amount}`,
    `Status:\n${input.status}`,
    "",
    `Time:\n${dateStr}, ${timeStr}`,
  ].join("\n");
}

export function buildLowStockAlert(input: {
  productName: string;
  quantity: number;
  threshold: number;
}): string {
  return [
    "\u26A0\uFE0F *LOW STOCK*",
    "",
    `Product:\n${input.productName}`,
    `Available:\n${input.quantity}`,
    `Threshold:\n${input.threshold}`,
  ].join("\n");
}

export function buildCriticalAlert(title: string, body: string): string {
  return `\uD83D\uDD14 *${title}*\n\n${body}`;
}

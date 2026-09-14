/** Shared General Goods line / approval description helpers. */

export function formatLineSnippet(name: string, qty: number, rate: number) {
  return `${name} ${qty}@${rate}`;
}

export type GeneralGoodsLineDescInput = {
  productName: string;
  quantity: number;
  rate: number;
};

/** Combined "ProductName qty@rate; …" string used on party/customer ledger legs. */
export function combinedGeneralGoodsLineDescription(
  lines: GeneralGoodsLineDescInput[],
  fallback = '',
) {
  const combined = lines
    .map((line) => formatLineSnippet(line.productName, Number(line.quantity), Number(line.rate)))
    .join('; ');
  return combined || fallback;
}

/** Approval card: "Purchase: Urea 5@4500; DAP 3@6200 from Supplier". */
export function generalPurchaseApprovalDescription(
  lines: GeneralGoodsLineDescInput[],
  partyName: string | null | undefined,
) {
  const linesDesc = combinedGeneralGoodsLineDescription(lines);
  if (!linesDesc) return partyName ? `Purchase from ${partyName}` : 'Purchase';
  return partyName ? `Purchase: ${linesDesc} from ${partyName}` : `Purchase: ${linesDesc}`;
}

/** Approval card: "Sale: Fertilizer X 10@800 to Customer". */
export function generalSaleApprovalDescription(
  lines: GeneralGoodsLineDescInput[],
  partyName: string | null | undefined,
) {
  const linesDesc = combinedGeneralGoodsLineDescription(lines);
  if (!linesDesc) return partyName ? `Sale to ${partyName}` : 'Sale';
  return partyName ? `Sale: ${linesDesc} to ${partyName}` : `Sale: ${linesDesc}`;
}

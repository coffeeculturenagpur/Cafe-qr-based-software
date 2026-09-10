function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function computeReceiptTotals(order, cafeInfo) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lineSum = items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0);
  const hasServerPricing = typeof order?.subtotalAmount === "number" && typeof order?.taxAmount === "number";
  const taxRate = Number(cafeInfo?.taxPercent || 0);
  const discountType = cafeInfo?.discountType || "percent";
  const discountValue = Number(cafeInfo?.discountValue || 0);
  const subtotal = hasServerPricing ? Number(order.subtotalAmount) : lineSum;
  const tax = hasServerPricing ? Number(order.taxAmount) : (subtotal * taxRate) / 100;
  const discount = hasServerPricing
    ? Number(order.discountAmount || 0)
    : discountType === "fixed"
      ? discountValue
      : (subtotal * discountValue) / 100;
  const total = hasServerPricing
    ? Number(order.totalAmount || 0)
    : Math.max(0, subtotal + tax - discount);
  return { items, taxRate, discountType, discountValue, subtotal, tax, discount, total };
}

/**
 * Build 80mm thermal receipt HTML.
 * @param {object} order
 * @param {object} cafeInfo
 * @param {{ title?: string, tag?: string, billType?: string }} [options]
 */
export function buildReceiptHtml(order, cafeInfo, options = {}) {
  const title = options.title || "Final Bill";
  const tag = options.tag || "Customer Copy";
  const billType = options.billType || "Combined final bill";
  const cafeName = cafeInfo?.name || "Cafe";
  const cafeLogo = cafeInfo?.logoUrl || "";
  const orderIdShort = String(order?._id || "").slice(-6).toUpperCase();
  const createdAt = order?.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();
  const tableLabel =
    Number(order?.tableNumber || 0) > 0 ? `Table ${order.tableNumber}` : "Walk-in";
  const orderNote = typeof order?.notes === "string" ? order.notes.trim() : "";
  const { items, taxRate, discountType, discountValue, subtotal, tax, discount, total } =
    computeReceiptTotals(order, cafeInfo);

  const itemsRows = items
    .map(
      (it) => `
      <tr>
        <td class="item-name">${escapeHtml(it.name || "Item")}</td>
        <td class="qty">${Number(it.qty || 1)}</td>
        <td class="price">INR ${(Number(it.price || 0) * Number(it.qty || 1)).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Receipt #${escapeHtml(orderIdShort)}</title>
    <style>
      @page { size: 80mm auto; margin: 3mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0; background: #fff; color: #111827;
        font-family: "Courier New", Courier, monospace; font-size: 11px; line-height: 1.35;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      body { width: 74mm; margin: 0 auto; padding: 2mm 0; }
      h1 { margin: 0; font-size: 15px; text-align: center; letter-spacing: 0.04em; }
      .center { text-align: center; }
      .logo { display: block; margin: 0 auto 6px; max-width: 110px; max-height: 48px; object-fit: contain; }
      .cafe-name {
        margin-bottom: 4px; font-size: 14px; font-weight: 700; text-align: center;
        text-transform: uppercase; word-break: break-word;
      }
      .meta { margin-top: 8px; }
      .meta div { margin: 1px 0; word-break: break-word; }
      .divider { margin: 8px 0; border-top: 1px dashed #111827; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { padding: 4px 0; vertical-align: top; }
      th {
        font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
        text-align: left; border-bottom: 1px dashed #111827;
      }
      .item-name { width: 58%; padding-right: 6px; word-break: break-word; }
      .qty { width: 12%; text-align: center; }
      .price { width: 30%; text-align: right; white-space: nowrap; }
      .summary { margin-top: 8px; }
      .line { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; }
      .line span:last-child { white-space: nowrap; text-align: right; }
      .total {
        margin-top: 6px; padding-top: 6px; border-top: 1px dashed #111827;
        font-size: 13px; font-weight: 700;
      }
      .note-box { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #111827; }
      .note-title { font-size: 10px; font-weight: 700; text-transform: uppercase; }
      .note-text { margin-top: 3px; word-break: break-word; white-space: pre-wrap; }
      .footer {
        margin-top: 10px; padding-top: 6px; border-top: 1px dashed #111827;
        text-align: center; font-size: 10px;
      }
      .tag {
        display: inline-block; border: 1px solid #111827; padding: 2px 8px;
        font-size: 10px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    ${cafeLogo ? `<img class="logo" src="${escapeHtml(cafeLogo)}" alt="Cafe logo" />` : ""}
    <div class="cafe-name">${escapeHtml(cafeName)}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="center"><span class="tag">${escapeHtml(tag)}</span></div>
    <div class="meta">
      <div>Order: #${escapeHtml(orderIdShort)}</div>
      <div>Table: ${escapeHtml(tableLabel)}</div>
      <div>Customer: ${escapeHtml(order?.customerName || "Guest")}</div>
      <div>Opened: ${escapeHtml(createdAt)}</div>
      <div>Bill type: ${escapeHtml(billType)}</div>
    </div>
    <div class="divider"></div>
    <table>
      <thead>
        <tr><th>Item</th><th class="qty">Qty</th><th class="price">Total</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <div class="summary">
      <div class="line"><span>Subtotal</span><span>INR ${subtotal.toFixed(2)}</span></div>
      <div class="line"><span>Tax (${taxRate.toFixed(2)}%)</span><span>INR ${tax.toFixed(2)}</span></div>
      <div class="line"><span>Discount (${discountType === "fixed" ? "INR" : `${discountValue.toFixed(2)}%`})</span><span>INR ${discount.toFixed(2)}</span></div>
      <div class="line total"><span>Total</span><span>INR ${total.toFixed(2)}</span></div>
    </div>
    ${
      orderNote
        ? `<div class="note-box"><div class="note-title">Order note</div><div class="note-text">${escapeHtml(orderNote)}</div></div>`
        : ""
    }
    <div class="footer">
      <div>Payment: ${escapeHtml(String(order?.paymentMode || "cash").toUpperCase())}</div>
      <div>Status: ${escapeHtml(String(order?.status || "pending").toUpperCase())}</div>
      <div>Thank you!</div>
    </div>
    <script>
      window.onload = function () {
        window.print();
        setTimeout(function () { window.close(); }, 800);
      };
    <\/script>
  </body>
</html>`;
}

export function openPrintWindow(html) {
  if (typeof window === "undefined") return false;
  const w = window.open("", "_blank", "width=420,height=720,scrollbars=yes");
  if (!w) {
    window.alert("Pop-up blocked! Please allow pop-ups for this site and try again.");
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function printCigaretteBill(order, cafeInfo) {
  const html = buildReceiptHtml(order, cafeInfo, {
    title: "Cigarette Bill",
    tag: "Customer Copy",
    billType: "Counter cigarette sale",
  });
  return openPrintWindow(html);
}

export function getOrderDisplayTotal(order, cafeInfo) {
  return computeReceiptTotals(order, cafeInfo).total;
}

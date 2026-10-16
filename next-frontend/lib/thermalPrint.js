// Thermal ESC/POS and Mobile Printing Utilities for QR Dine / Coffee Culture

import { LOGO_ESCPOS_BASE64 } from "./logoEscPos";

const ESC = "\x1b";
const GS = "\x1d";

export const PRINTER_MODES = {
  BLUETOOTH: "bluetooth",
  RAWBT: "rawbt",
  WEBHOOK: "webhook",
  BROWSER: "browser",
  ASK: "ask",
};

export const STORAGE_KEY_PRINTER_MODE = "qrdine_printer_mode";
export const STORAGE_KEY_PAPER_SIZE = "qrdine_printer_paper"; // "80" or "58"
export const STORAGE_KEY_WEBHOOK_URL = "qrdine_printer_webhook";
export const STORAGE_KEY_BT_NAME = "qrdine_printer_bt_name";

// In-memory cache for active Bluetooth device connection
let activeBleDevice = null;
let activeBleCharacteristic = null;

// Cached Logo ESC/POS bytes
let cachedLogoBytes = null;

/**
 * Returns ESC/POS binary bitmap bytes for The Coffee Culture logo.
 */
export function getLogoEscPosBytes() {
  if (cachedLogoBytes) return cachedLogoBytes;
  if (!LOGO_ESCPOS_BASE64) return new Uint8Array(0);

  try {
    const binary = typeof window !== "undefined"
      ? window.atob(LOGO_ESCPOS_BASE64)
      : Buffer.from(LOGO_ESCPOS_BASE64, "base64").toString("binary");
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    cachedLogoBytes = bytes;
    return bytes;
  } catch (err) {
    console.warn("Could not decode thermal logo bytes:", err);
    return new Uint8Array(0);
  }
}

/**
 * Helper to concatenate multiple Uint8Arrays.
 */
function concatUint8Arrays(arrays) {
  const totalLength = arrays.reduce((acc, val) => acc + (val?.length || 0), 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    if (arr && arr.length > 0) {
      result.set(arr, offset);
      offset += arr.length;
    }
  }
  return result;
}

/**
 * Format phone string matching original kitchen display.
 */
function formatKitchenPhone(phone) {
  const s = String(phone || "").trim();
  if (!s) return "—";
  if (s.startsWith("manual-table-")) return "Walk-in (no phone on file)";
  if (s.startsWith("manual-walk-in")) return "Walk-in (no phone on file)";
  return s;
}

/**
 * Checks if the current client is a mobile or tablet device.
 */
export function isMobileDevice() {
  if (typeof window === "undefined" || !window.navigator) return false;
  const ua = window.navigator.userAgent || "";
  return /android|iphone|ipad|ipod|mobile|tablet/i.test(ua) || (window.navigator.maxTouchPoints > 1 && /mac/i.test(ua));
}

/**
 * Check if Web Bluetooth is available in this browser.
 */
export function isWebBluetoothSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.bluetooth);
}

/**
 * Retrieve saved printer preferences from localStorage.
 */
export function getPrinterPreferences() {
  if (typeof window === "undefined") {
    return {
      mode: PRINTER_MODES.BROWSER,
      paperSize: "80",
      webhookUrl: "",
      bluetoothDeviceName: "",
    };
  }
  const isMobile = isMobileDevice();
  const savedMode = localStorage.getItem(STORAGE_KEY_PRINTER_MODE);
  const mode = savedMode || (isMobile ? PRINTER_MODES.ASK : PRINTER_MODES.BROWSER);
  const paperSize = localStorage.getItem(STORAGE_KEY_PAPER_SIZE) || "80";
  const webhookUrl = localStorage.getItem(STORAGE_KEY_WEBHOOK_URL) || "";
  const bluetoothDeviceName = localStorage.getItem(STORAGE_KEY_BT_NAME) || "";

  return { mode, paperSize, webhookUrl, bluetoothDeviceName };
}

/**
 * Save printer preferences to localStorage.
 */
export function savePrinterPreferences({ mode, paperSize, webhookUrl, bluetoothDeviceName }) {
  if (typeof window === "undefined") return;
  if (mode !== undefined) localStorage.setItem(STORAGE_KEY_PRINTER_MODE, mode);
  if (paperSize !== undefined) localStorage.setItem(STORAGE_KEY_PAPER_SIZE, paperSize);
  if (webhookUrl !== undefined) localStorage.setItem(STORAGE_KEY_WEBHOOK_URL, webhookUrl);
  if (bluetoothDeviceName !== undefined) localStorage.setItem(STORAGE_KEY_BT_NAME, bluetoothDeviceName);
}

/**
 * Return current Bluetooth connection state.
 */
export function getActiveBluetoothDevice() {
  const isConnected = Boolean(activeBleDevice?.gatt?.connected && activeBleCharacteristic);
  const name = activeBleDevice?.name || (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_BT_NAME) : "") || "";
  return {
    connected: isConnected,
    name: name,
    device: activeBleDevice,
  };
}

/**
 * Disconnect current active Bluetooth device.
 */
export function disconnectWebBluetoothPrinter() {
  try {
    if (activeBleDevice?.gatt?.connected) {
      activeBleDevice.gatt.disconnect();
    }
  } catch {}
  activeBleDevice = null;
  activeBleCharacteristic = null;
}

/**
 * Pad a string to target length with alignment.
 */
function pad(str, len, align = "left") {
  const s = String(str ?? "");
  if (s.length >= len) return s.slice(0, len);
  const diff = len - s.length;
  if (align === "right") return " ".repeat(diff) + s;
  if (align === "center") {
    const left = Math.floor(diff / 2);
    const right = diff - left;
    return " ".repeat(left) + s + " ".repeat(right);
  }
  return s + " ".repeat(diff);
}

/**
 * Format table rows with column widths.
 */
function formatTableRow(col1, col2, col3, width = 48) {
  if (width === 58 || width <= 32) {
    // 32-column mode (58mm)
    // col1: 17 chars, col2: 5 chars, col3: 10 chars
    return `${pad(col1, 17, "left")}${pad(col2, 5, "center")}${pad(col3, 10, "right")}\n`;
  }
  // 48-column mode (80mm)
  // col1: 28 chars, col2: 6 chars, col3: 14 chars
  return `${pad(col1, 28, "left")}${pad(col2, 6, "center")}${pad(col3, 14, "right")}\n`;
}

function formatTwoColumns(left, right, width = 48) {
  const maxLen = width === 58 || width <= 32 ? 32 : 48;
  const l = String(left ?? "");
  const r = String(right ?? "");
  const space = maxLen - l.length - r.length;
  if (space < 1) {
    return `${l}\n${" ".repeat(Math.max(0, maxLen - r.length))}${r}\n`;
  }
  return `${l}${" ".repeat(space)}${r}\n`;
}

/**
 * Compute order financial details.
 */
function getOrderTotals(order, cafeInfo) {
  const rawItems = Array.isArray(order?.items) ? order.items : [];
  const taxRate = Number(cafeInfo?.taxPercent || 0);
  const discountType = cafeInfo?.discountType || "percent";
  const discountValue = Number(cafeInfo?.discountValue || 0);

  const items = rawItems.map((it) => ({
    name: String(it.name || "Item"),
    price: Number(it.price || 0),
    qty: Number(it.qty || 1),
  }));

  const hasServerPricing = typeof order?.subtotalAmount === "number" && typeof order?.taxAmount === "number";
  const lineSum = items.reduce((s, it) => s + it.price * it.qty, 0);
  const subtotal = hasServerPricing ? Number(order.subtotalAmount) : lineSum;
  const tax = hasServerPricing ? Number(order.taxAmount) : (subtotal * taxRate) / 100;
  const discount = hasServerPricing
    ? Number(order.discountAmount || 0)
    : discountType === "fixed"
    ? discountValue
    : (subtotal * discountValue) / 100;
  const total = hasServerPricing ? Number(order.totalAmount || 0) : Math.max(0, subtotal + tax - discount);

  return { items, subtotal, tax, taxRate, discount, discountType, discountValue, total };
}

/**
 * Generate formatted Plaintext receipt with identical original structure.
 */
export function buildReceiptText(order, cafeInfo, options = {}) {
  const { billType = "customer", paperSize = "80" } = options;
  const cols = paperSize === "58" ? 32 : 48;
  const divider = "-".repeat(cols) + "\n";
  const doubleDivider = "=".repeat(cols) + "\n";

  const isChef = billType === "chef";
  const isCustomer = billType === "customer";
  const isBoth = billType === "both";

  const orderIdShort = String(order?._id || "").slice(-6).toUpperCase() || "TEST";
  const tableLabel = Number(order?.tableNumber || 0) > 0 ? `Table ${order.tableNumber}` : "Walk-in";
  const customerName = String(order?.customerName || "Guest");
  const phone = formatKitchenPhone(order?.phone);
  const cafeName = cafeInfo?.name || "Coffee Culture";
  const orderNote = typeof order?.notes === "string" ? order.notes.trim() : "";
  const createdAt = order?.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();
  const updatedAt = order?.updatedAt ? new Date(order.updatedAt).toLocaleString() : createdAt;
  const timeStr = new Date().toLocaleTimeString();
  const payMode = String(order?.paymentMode || "cash").toUpperCase();
  const orderStatus = String(order?.status || "pending").toUpperCase();

  const { items, subtotal, tax, taxRate, discount, discountType, discountValue, total } = getOrderTotals(order, cafeInfo);
  const discountLabel = discountType === "fixed" ? "INR" : `${discountValue.toFixed(2)}%`;

  // Helper to build Customer copy text exactly matching original bill
  const buildCustomerText = () => {
    let t = "";
    t += pad("[ LOGO: THE COFFEE CULTURE ]", cols, "center") + "\n";
    t += pad(cafeName.toUpperCase(), cols, "center") + "\n";
    t += pad("Final Bill", cols, "center") + "\n";
    t += pad("[ Customer Copy ]", cols, "center") + "\n\n";
    t += `Order: #${orderIdShort}\n`;
    t += `Table: ${tableLabel}\n`;
    t += `Customer: ${customerName}\n`;
    t += `Phone: ${phone}\n`;
    t += `Opened: ${createdAt}\n`;
    t += `Last updated: ${updatedAt}\n`;
    t += `Bill type: Customer final bill\n`;
    t += divider;
    t += formatTableRow("Item", "Qty", "Total", cols);
    t += divider;
    items.forEach((it) => {
      const lineTotal = (it.price * it.qty).toFixed(2);
      t += formatTableRow(it.name, String(it.qty), `INR ${lineTotal}`, cols);
    });
    t += divider;
    t += formatTwoColumns("Subtotal", `INR ${subtotal.toFixed(2)}`, cols);
    t += formatTwoColumns(`Tax (${taxRate.toFixed(2)}%)`, `INR ${tax.toFixed(2)}`, cols);
    t += formatTwoColumns(`Discount (${discountLabel})`, `INR ${discount.toFixed(2)}`, cols);
    t += doubleDivider;
    t += formatTwoColumns("Total", `INR ${total.toFixed(2)}`, cols);
    t += doubleDivider;
    if (orderNote) {
      t += `Order note\n${orderNote}\n` + divider;
    }
    t += pad(`Payment: ${payMode}`, cols, "center") + "\n";
    t += pad(`Status: ${orderStatus}`, cols, "center") + "\n";
    t += pad("Thank you for visiting!", cols, "center") + "\n\n";
    return t;
  };

  // Helper to build KOT text exactly matching original bill
  const buildKotText = () => {
    let t = "";
    t += pad("[ LOGO: THE COFFEE CULTURE ]", cols, "center") + "\n";
    t += pad("Kitchen Order (KOT)", cols, "center") + "\n";
    t += pad("[ Chef Copy ]", cols, "center") + "\n\n";
    t += `Order: #${orderIdShort}\n`;
    t += `Table: ${tableLabel}\n`;
    t += `Customer: ${customerName}\n`;
    t += `Phone: ${phone}\n`;
    t += `Time: ${timeStr}\n`;
    t += divider;
    t += formatTwoColumns("Item", "Qty", cols);
    t += divider;
    items.forEach((it) => {
      t += formatTwoColumns(it.name, `x ${it.qty}`, cols);
    });
    t += divider;
    if (orderNote) {
      t += `Order note\n${orderNote}\n` + divider;
    }
    t += pad("— Prepare promptly —", cols, "center") + "\n\n";
    return t;
  };

  let out = "";
  if (isChef) {
    out += buildKotText();
  } else if (isCustomer) {
    out += buildCustomerText();
  } else if (isBoth) {
    out += buildCustomerText();
    out += "\n" + "=".repeat(cols) + "\n\n";
    out += buildKotText();
  }

  return out;
}

/**
 * Generate binary ESC/POS byte buffer including the Coffee Culture logo and exact structure.
 */
export function buildEscPosBuffer(order, cafeInfo, options = {}) {
  const { billType = "customer", paperSize = "80", includeLogo = true } = options;
  const cols = paperSize === "58" ? 32 : 48;
  const divider = "-".repeat(cols) + "\n";
  const doubleDivider = "=".repeat(cols) + "\n";

  const orderIdShort = String(order?._id || "").slice(-6).toUpperCase() || "TEST";
  const tableLabel = Number(order?.tableNumber || 0) > 0 ? `Table ${order.tableNumber}` : "Walk-in";
  const customerName = String(order?.customerName || "Guest");
  const phone = formatKitchenPhone(order?.phone);
  const cafeName = cafeInfo?.name || "Coffee Culture";
  const orderNote = typeof order?.notes === "string" ? order.notes.trim() : "";
  const createdAt = order?.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();
  const updatedAt = order?.updatedAt ? new Date(order.updatedAt).toLocaleString() : createdAt;
  const timeStr = new Date().toLocaleTimeString();
  const payMode = String(order?.paymentMode || "cash").toUpperCase();
  const orderStatus = String(order?.status || "pending").toUpperCase();

  const { items, subtotal, tax, taxRate, discount, discountType, discountValue, total } = getOrderTotals(order, cafeInfo);
  const discountLabel = discountType === "fixed" ? "INR" : `${discountValue.toFixed(2)}%`;

  // ESC/POS Command Sequences
  const ALIGN_CENTER = `${ESC}a\x01`;
  const ALIGN_LEFT = `${ESC}a\x00`;
  const BOLD_ON = `${ESC}E\x01`;
  const BOLD_OFF = `${ESC}E\x00`;
  const TEXT_NORMAL = `${GS}!\x00`;
  const TEXT_DOUBLE_HEIGHT = `${GS}!\x01`;
  const TEXT_DOUBLE_SIZE = `${GS}!\x11`;
  const CUT_PAPER = `\n\n\n\n${GS}V\x41\x00`;

  const logoBytes = includeLogo ? getLogoEscPosBytes() : new Uint8Array(0);
  const encoder = new TextEncoder();

  // Helper for customer bill ESC/POS string
  const buildCustomerEscPosText = () => {
    let s = "";
    s += ALIGN_CENTER;
    s += BOLD_ON + TEXT_DOUBLE_SIZE + `${cafeName}\n` + TEXT_NORMAL + BOLD_OFF;
    s += BOLD_ON + TEXT_DOUBLE_HEIGHT + "Final Bill\n" + TEXT_NORMAL + BOLD_OFF;
    s += "[ Customer Copy ]\n\n";
    s += ALIGN_LEFT;
    s += `Order: #${orderIdShort}\n`;
    s += `Table: ${tableLabel}\n`;
    s += `Customer: ${customerName}\n`;
    s += `Phone: ${phone}\n`;
    s += `Opened: ${createdAt}\n`;
    s += `Last updated: ${updatedAt}\n`;
    s += `Bill type: Customer final bill\n`;
    s += divider;
    s += BOLD_ON + formatTableRow("Item", "Qty", "Total", cols) + BOLD_OFF;
    s += divider;
    items.forEach((it) => {
      const lineTotal = (it.price * it.qty).toFixed(2);
      s += formatTableRow(it.name, String(it.qty), `INR ${lineTotal}`, cols);
    });
    s += divider;
    s += formatTwoColumns("Subtotal", `INR ${subtotal.toFixed(2)}`, cols);
    s += formatTwoColumns(`Tax (${taxRate.toFixed(2)}%)`, `INR ${tax.toFixed(2)}`, cols);
    s += formatTwoColumns(`Discount (${discountLabel})`, `INR ${discount.toFixed(2)}`, cols);
    s += doubleDivider;
    s += BOLD_ON + TEXT_DOUBLE_HEIGHT + formatTwoColumns("Total", `INR ${total.toFixed(2)}`, cols) + TEXT_NORMAL + BOLD_OFF;
    s += doubleDivider;
    if (orderNote) {
      s += BOLD_ON + "Order note\n" + BOLD_OFF;
      s += `${orderNote}\n`;
      s += divider;
    }
    s += ALIGN_CENTER;
    s += `Payment: ${payMode}\n`;
    s += `Status: ${orderStatus}\n`;
    s += "Thank you for visiting!\n";
    s += CUT_PAPER;
    return s;
  };

  // Helper for KOT ESC/POS string
  const buildKotEscPosText = () => {
    let s = "";
    s += ALIGN_CENTER;
    s += BOLD_ON + TEXT_DOUBLE_SIZE + "Kitchen Order (KOT)\n" + TEXT_NORMAL + BOLD_OFF;
    s += "[ Chef Copy ]\n\n";
    s += ALIGN_LEFT;
    s += `Order: #${orderIdShort}\n`;
    s += `Table: ${tableLabel}\n`;
    s += `Customer: ${customerName}\n`;
    s += `Phone: ${phone}\n`;
    s += `Time: ${timeStr}\n`;
    s += divider;
    s += BOLD_ON + formatTwoColumns("Item", "Qty", cols) + BOLD_OFF;
    s += divider;
    items.forEach((it) => {
      s += BOLD_ON + TEXT_DOUBLE_HEIGHT + formatTwoColumns(it.name, `x ${it.qty}`, cols) + TEXT_NORMAL + BOLD_OFF;
    });
    s += divider;
    if (orderNote) {
      s += BOLD_ON + "Order note\n" + BOLD_OFF;
      s += `${orderNote}\n`;
      s += divider;
    }
    s += ALIGN_CENTER;
    s += "— Prepare promptly —\n";
    s += CUT_PAPER;
    return s;
  };

  const initCmd = encoder.encode(`${ESC}@`);
  const centerCmd = encoder.encode(ALIGN_CENTER);
  const lfCmd = encoder.encode("\n");

  const parts = [initCmd];

  if (billType === "chef") {
    if (logoBytes.length > 0) {
      parts.push(centerCmd, logoBytes, lfCmd);
    }
    parts.push(encoder.encode(buildKotEscPosText()));
  } else if (billType === "customer") {
    if (logoBytes.length > 0) {
      parts.push(centerCmd, logoBytes, lfCmd);
    }
    parts.push(encoder.encode(buildCustomerEscPosText()));
  } else if (billType === "both") {
    // 1. Chef copy (KOT)
    if (logoBytes.length > 0) {
      parts.push(centerCmd, logoBytes, lfCmd);
    }
    parts.push(encoder.encode(buildKotEscPosText()));

    // 2. Customer copy
    if (logoBytes.length > 0) {
      parts.push(centerCmd, logoBytes, lfCmd);
    }
    parts.push(encoder.encode(buildCustomerEscPosText()));
  }

  return concatUint8Arrays(parts);
}

/**
 * Common Bluetooth Service UUIDs for thermal receipt printers.
 */
const PRINTER_BLE_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Standard ESC/POS BLE Service
  "0000ffe0-0000-1000-8000-00805f9b34fb", // Vendor Transparent Serial (HM-10 / MPT / POS)
  "0000e7cf-0000-1000-8000-00805f9b34fb", // Common Chinese Thermal Printer
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC / Microchip Transparent UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Alternate BLE printer UUID
  "0000af30-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
];

/**
 * Connect to a Bluetooth thermal printer via Web Bluetooth API.
 */
export async function connectWebBluetoothPrinter() {
  if (!isWebBluetoothSupported()) {
    throw new Error(
      "Web Bluetooth is not supported on this browser. On Android, please use Google Chrome or Edge. On iOS, install Bluefy. Alternatively, choose RawBT App."
    );
  }

  // If already connected and characteristic is ready, return it
  if (activeBleDevice?.gatt?.connected && activeBleCharacteristic) {
    return { device: activeBleDevice, characteristic: activeBleCharacteristic };
  }

  let device;
  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_BLE_SERVICES,
    });
  } catch (err) {
    if (err.name === "NotFoundError" || err.message?.includes("User cancelled")) {
      throw new Error("Device selection was cancelled.");
    }
    throw err;
  }

  if (!device || !device.gatt) {
    throw new Error("No Bluetooth device selected.");
  }

  const server = await device.gatt.connect();

  let foundCharacteristic = null;

  for (const serviceUuid of PRINTER_BLE_SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          foundCharacteristic = char;
          break;
        }
      }
      if (foundCharacteristic) break;
    } catch {}
  }

  if (!foundCharacteristic) {
    try {
      const services = await server.getPrimaryServices();
      for (const s of services) {
        try {
          const chars = await s.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              foundCharacteristic = c;
              break;
            }
          }
          if (foundCharacteristic) break;
        } catch {}
      }
    } catch {}
  }

  if (!foundCharacteristic) {
    throw new Error(
      `Connected to ${device.name || "printer"}, but could not find a writable thermal print characteristic.`
    );
  }

  activeBleDevice = device;
  activeBleCharacteristic = foundCharacteristic;
  if (device.name) {
    savePrinterPreferences({ bluetoothDeviceName: device.name });
  }

  device.addEventListener("gattserverdisconnected", () => {
    activeBleCharacteristic = null;
  });

  return { device, characteristic: foundCharacteristic };
}

/**
 * Send binary data over Bluetooth in chunks to respect BLE MTU limits.
 */
async function sendBleChunks(characteristic, data, chunkSize = 100) {
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Print order directly via Web Bluetooth API.
 */
export async function printViaWebBluetooth(order, cafeInfo, options = {}) {
  const escposData = buildEscPosBuffer(order, cafeInfo, options);
  const { device, characteristic } = await connectWebBluetoothPrinter();
  await sendBleChunks(characteristic, escposData);
  return { success: true, deviceName: device.name || "Bluetooth Printer" };
}

/**
 * Print order via RawBT Android App using Android Intent / URL Scheme.
 */
export function printViaRawBT(order, cafeInfo, options = {}) {
  if (typeof window === "undefined") return false;

  const escposData = buildEscPosBuffer(order, cafeInfo, options);

  // Convert Uint8Array to base64 safely
  let binary = "";
  const len = escposData.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(escposData[i]);
  }
  const base64Data = window.btoa(binary);

  // Android intent URL with fallback to Google Play store
  const intentUrl =
    "intent:base64," +
    base64Data +
    "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=" +
    encodeURIComponent("https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter") +
    ";end;";

  const anchor = document.createElement("a");
  anchor.href = intentUrl;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    try {
      document.body.removeChild(anchor);
    } catch {}
  }, 1000);

  return { success: true, mode: "rawbt" };
}

/**
 * Print order via a local or remote Webhook endpoint.
 */
export async function printViaWebhook(order, cafeInfo, options = {}) {
  const webhookUrl = options.webhookUrl || localStorage.getItem(STORAGE_KEY_WEBHOOK_URL);
  if (!webhookUrl) {
    throw new Error("No print webhook URL configured. Please set a webhook URL in printer settings.");
  }

  const escposData = buildEscPosBuffer(order, cafeInfo, options);
  let binary = "";
  const len = escposData.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(escposData[i]);
  }
  const base64Data = window.btoa(binary);

  const payload = {
    orderId: order?._id,
    tableNumber: order?.tableNumber,
    billType: options.billType || "customer",
    paperSize: options.paperSize || "80",
    escposBase64: base64Data,
    plainText: buildReceiptText(order, cafeInfo, options),
    order,
    cafeInfo,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Print webhook returned HTTP status ${response.status}`);
  }

  return { success: true, mode: "webhook" };
}

/**
 * High-level unified print dispatcher.
 */
export async function executeThermalPrint(order, cafeInfo, options = {}) {
  const prefs = getPrinterPreferences();
  const mode = options.mode || prefs.mode;
  const paperSize = options.paperSize || prefs.paperSize;
  const billType = options.billType || "customer";

  const printOptions = {
    ...options,
    billType,
    paperSize,
  };

  if (mode === PRINTER_MODES.ASK) {
    return { status: "need_prompt", order, printOptions };
  }

  if (mode === PRINTER_MODES.BLUETOOTH) {
    const res = await printViaWebBluetooth(order, cafeInfo, printOptions);
    return { status: "success", mode: PRINTER_MODES.BLUETOOTH, ...res };
  }

  if (mode === PRINTER_MODES.RAWBT) {
    const res = printViaRawBT(order, cafeInfo, printOptions);
    return { status: "success", mode: PRINTER_MODES.RAWBT, ...res };
  }

  if (mode === PRINTER_MODES.WEBHOOK) {
    const res = await printViaWebhook(order, cafeInfo, printOptions);
    return { status: "success", mode: PRINTER_MODES.WEBHOOK, ...res };
  }

  // PRINTER_MODES.BROWSER
  return { status: "browser_fallback", order, printOptions };
}

/**
 * Generate a sample test order and print it via specified method.
 */
export async function printTestReceipt(cafeInfo, options = {}) {
  const testOrder = {
    _id: "TEST" + Math.floor(1000 + Math.random() * 9000),
    tableNumber: "9",
    customerName: "Test Guest",
    phone: "9876543210",
    paymentMode: "CASH",
    items: [
      { name: "Cold Coffee", price: 150, qty: 1 },
      { name: "Cappuccino", price: 180, qty: 2 },
    ],
    notes: "Printer test print OK!",
  };

  return executeThermalPrint(testOrder, cafeInfo, {
    billType: options.billType || "customer",
    mode: options.mode,
    paperSize: options.paperSize,
  });
}

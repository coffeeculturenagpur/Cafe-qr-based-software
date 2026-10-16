"use client";

import React, { useEffect, useState } from "react";
import {
  Printer,
  Bluetooth,
  Smartphone,
  Globe,
  Check,
  AlertCircle,
  X,
  RefreshCw,
  Sliders,
  CheckCircle2,
  ExternalLink,
  Laptop,
} from "lucide-react";
import { Button } from "../ui/Button";
import {
  PRINTER_MODES,
  getPrinterPreferences,
  savePrinterPreferences,
  isMobileDevice,
  isWebBluetoothSupported,
  connectWebBluetoothPrinter,
  getActiveBluetoothDevice,
  disconnectWebBluetoothPrinter,
  executeThermalPrint,
  printTestReceipt,
} from "../../lib/thermalPrint";

export function MobilePrintModal({
  isOpen,
  onClose,
  pendingOrder = null,
  pendingBillType = "customer",
  cafeInfo = null,
  onDirectPrintBrowser = null,
}) {
  const [selectedMode, setSelectedMode] = useState(PRINTER_MODES.BLUETOOTH);
  const [paperSize, setPaperSize] = useState("80");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [rememberChoice, setRememberChoice] = useState(true);
  const [billType, setBillType] = useState(pendingBillType);

  const [btStatus, setBtStatus] = useState({ connected: false, name: "" });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const isMobile = isMobileDevice();
  const hasWebBluetooth = isWebBluetoothSupported();

  // Load preferences when modal opens
  useEffect(() => {
    if (isOpen) {
      const prefs = getPrinterPreferences();
      // If user had PRINTER_MODES.ASK, default UI highlight to BLUETOOTH on mobile or BROWSER on desktop
      const effectiveMode =
        prefs.mode === PRINTER_MODES.ASK
          ? isMobile
            ? PRINTER_MODES.BLUETOOTH
            : PRINTER_MODES.BROWSER
          : prefs.mode;

      setSelectedMode(effectiveMode);
      setPaperSize(prefs.paperSize || "80");
      setWebhookUrl(prefs.webhookUrl || "");
      setBillType(pendingBillType || "customer");
      setBtStatus(getActiveBluetoothDevice());
      setStatusMessage(null);
      setErrorMessage(null);
    }
  }, [isOpen, pendingBillType, isMobile]);

  if (!isOpen) return null;

  const handleConnectBluetooth = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const { device } = await connectWebBluetoothPrinter();
      setBtStatus({ connected: true, name: device.name || "Bluetooth Printer" });
      setStatusMessage(`Connected to ${device.name || "Bluetooth Printer"}!`);
    } catch (err) {
      setErrorMessage(err.message || "Failed to connect to Bluetooth device.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectBluetooth = () => {
    disconnectWebBluetoothPrinter();
    setBtStatus({ connected: false, name: "" });
    setStatusMessage("Bluetooth printer disconnected.");
  };

  const handleSavePreferences = () => {
    savePrinterPreferences({
      mode: rememberChoice ? selectedMode : PRINTER_MODES.ASK,
      paperSize,
      webhookUrl,
      bluetoothDeviceName: btStatus.name,
    });
  };

  const handlePrintCurrent = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsPrinting(true);

    handleSavePreferences();

    try {
      if (selectedMode === PRINTER_MODES.BROWSER) {
        if (onDirectPrintBrowser && pendingOrder) {
          onDirectPrintBrowser(pendingOrder, billType);
        }
        onClose();
        return;
      }

      if (pendingOrder) {
        const res = await executeThermalPrint(pendingOrder, cafeInfo, {
          mode: selectedMode,
          paperSize,
          billType,
          webhookUrl,
        });

        if (res.status === "browser_fallback") {
          if (onDirectPrintBrowser) {
            onDirectPrintBrowser(pendingOrder, billType);
          }
          onClose();
          return;
        }

        setStatusMessage("Print command sent successfully!");
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        // If no pending order, run test print
        await printTestReceipt(cafeInfo, {
          mode: selectedMode,
          paperSize,
          billType,
          webhookUrl,
        });
        setStatusMessage("Test receipt sent to printer!");
      }
    } catch (err) {
      setErrorMessage(err.message || "Printing failed. Please check printer connection.");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleTestPrint = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsPrinting(true);
    try {
      if (selectedMode === PRINTER_MODES.BROWSER) {
        if (onDirectPrintBrowser) {
          const sample = {
            _id: "TEST" + Math.floor(1000 + Math.random() * 9000),
            tableNumber: "9",
            customerName: "Test Printer",
            items: [{ name: "Test Espresso", price: 120, qty: 1 }],
          };
          onDirectPrintBrowser(sample, billType);
        }
        return;
      }

      await printTestReceipt(cafeInfo, {
        mode: selectedMode,
        paperSize,
        billType,
        webhookUrl,
      });
      setStatusMessage("Test slip sent to printer!");
    } catch (err) {
      setErrorMessage(err.message || "Test print failed. Please check printer connection.");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-100 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                Mobile Printer Setup
                {isMobile ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                    <Smartphone className="h-3 w-3" /> Phone
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 flex items-center gap-1">
                    <Laptop className="h-3 w-3" /> Desktop
                  </span>
                )}
              </h2>
              <p className="text-xs text-neutral-400">
                Print bills directly via Bluetooth, RawBT, or Browser
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Banners */}
        {errorMessage && (
          <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl bg-red-950/80 border border-red-800 px-3.5 py-2.5 text-xs font-semibold text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-xl bg-emerald-950/80 border border-emerald-800 px-3.5 py-2.5 text-xs font-semibold text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="flex-1">{statusMessage}</span>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Method Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Select Printing Method
            </label>

            {/* Mode 1: Web Bluetooth */}
            <div
              onClick={() => setSelectedMode(PRINTER_MODES.BLUETOOTH)}
              className={`cursor-pointer rounded-xl border p-3.5 transition flex flex-col gap-2 ${
                selectedMode === PRINTER_MODES.BLUETOOTH
                  ? "border-orange-500 bg-orange-500/10 text-white"
                  : "border-neutral-800 bg-neutral-800/40 text-neutral-300 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      selectedMode === PRINTER_MODES.BLUETOOTH
                        ? "bg-orange-500 text-white"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    <Bluetooth className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      Direct Bluetooth (Web BLE)
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
                        Zero Apps Needed
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      Chrome on Android, Samsung Internet, or Bluefy on iOS
                    </div>
                  </div>
                </div>
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    selectedMode === PRINTER_MODES.BLUETOOTH
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-neutral-700"
                  }`}
                >
                  {selectedMode === PRINTER_MODES.BLUETOOTH && <Check className="h-3 w-3" />}
                </div>
              </div>

              {/* Bluetooth connection status and pair button */}
              {selectedMode === PRINTER_MODES.BLUETOOTH && (
                <div className="mt-2 pt-2 border-t border-neutral-700/60 flex items-center justify-between gap-2">
                  <div className="text-xs">
                    {btStatus.connected ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        Connected: {btStatus.name || "Bluetooth Printer"}
                      </span>
                    ) : (
                      <span className="text-neutral-400">No printer paired yet</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {btStatus.connected ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDisconnectBluetooth();
                        }}
                        className="text-xs font-semibold text-neutral-400 hover:text-red-400 px-2 py-1 rounded border border-neutral-700 hover:border-red-800"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={isConnecting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnectBluetooth();
                        }}
                        className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold"
                      >
                        {isConnecting ? (
                          <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Bluetooth className="mr-1 h-3 w-3" />
                        )}
                        Pair / Connect Printer
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mode 2: RawBT App Intent */}
            <div
              onClick={() => setSelectedMode(PRINTER_MODES.RAWBT)}
              className={`cursor-pointer rounded-xl border p-3.5 transition flex flex-col gap-2 ${
                selectedMode === PRINTER_MODES.RAWBT
                  ? "border-orange-500 bg-orange-500/10 text-white"
                  : "border-neutral-800 bg-neutral-800/40 text-neutral-300 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      selectedMode === PRINTER_MODES.RAWBT
                        ? "bg-orange-500 text-white"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      RawBT App (Android Intent)
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        100% Reliable
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      Standard Android POS driver for any Bluetooth, USB, or Wi-Fi printer
                    </div>
                  </div>
                </div>
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    selectedMode === PRINTER_MODES.RAWBT
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-neutral-700"
                  }`}
                >
                  {selectedMode === PRINTER_MODES.RAWBT && <Check className="h-3 w-3" />}
                </div>
              </div>

              {selectedMode === PRINTER_MODES.RAWBT && (
                <div className="mt-1 text-[11px] text-neutral-400 flex items-center gap-1.5">
                  <span>If not installed, tapping print opens Google Play to install RawBT.</span>
                  <a
                    href="https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter"
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-400 hover:underline font-bold inline-flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Get App <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Mode 3: Local Webhook / Print Server */}
            <div
              onClick={() => setSelectedMode(PRINTER_MODES.WEBHOOK)}
              className={`cursor-pointer rounded-xl border p-3.5 transition flex flex-col gap-2 ${
                selectedMode === PRINTER_MODES.WEBHOOK
                  ? "border-orange-500 bg-orange-500/10 text-white"
                  : "border-neutral-800 bg-neutral-800/40 text-neutral-300 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      selectedMode === PRINTER_MODES.WEBHOOK
                        ? "bg-orange-500 text-white"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      Local Webhook / Print Server
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        Network POS
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      HTTP POST to Raspberry Pi, LAN print bridge, or local port
                    </div>
                  </div>
                </div>
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    selectedMode === PRINTER_MODES.WEBHOOK
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-neutral-700"
                  }`}
                >
                  {selectedMode === PRINTER_MODES.WEBHOOK && <Check className="h-3 w-3" />}
                </div>
              </div>

              {selectedMode === PRINTER_MODES.WEBHOOK && (
                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="url"
                    placeholder="http://192.168.1.100:8080/print or http://localhost:9100"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full text-xs rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              )}
            </div>

            {/* Mode 4: Standard Browser Print Window */}
            <div
              onClick={() => setSelectedMode(PRINTER_MODES.BROWSER)}
              className={`cursor-pointer rounded-xl border p-3.5 transition flex flex-col gap-2 ${
                selectedMode === PRINTER_MODES.BROWSER
                  ? "border-orange-500 bg-orange-500/10 text-white"
                  : "border-neutral-800 bg-neutral-800/40 text-neutral-300 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      selectedMode === PRINTER_MODES.BROWSER
                        ? "bg-orange-500 text-white"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    <Printer className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      Browser System Print
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-300">
                        Desktop / AirPrint
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400">
                      Standard print dialog popup (for PC/Mac or Wi-Fi AirPrint printers)
                    </div>
                  </div>
                </div>
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    selectedMode === PRINTER_MODES.BROWSER
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-neutral-700"
                  }`}
                >
                  {selectedMode === PRINTER_MODES.BROWSER && <Check className="h-3 w-3" />}
                </div>
              </div>
            </div>
          </div>

          {/* Paper Size & Bill Type */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Paper Width
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaperSize("80")}
                  className={`py-2 rounded-lg text-xs font-bold border transition ${
                    paperSize === "80"
                      ? "bg-orange-500/20 border-orange-500 text-orange-300"
                      : "bg-neutral-800/40 border-neutral-700 text-neutral-400"
                  }`}
                >
                  80mm Standard
                </button>
                <button
                  type="button"
                  onClick={() => setPaperSize("58")}
                  className={`py-2 rounded-lg text-xs font-bold border transition ${
                    paperSize === "58"
                      ? "bg-orange-500/20 border-orange-500 text-orange-300"
                      : "bg-neutral-800/40 border-neutral-700 text-neutral-400"
                  }`}
                >
                  58mm Portable
                </button>
              </div>
            </div>

            {pendingOrder && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Bill Copy
                </label>
                <select
                  value={billType}
                  onChange={(e) => setBillType(e.target.value)}
                  className="w-full h-9 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 text-xs font-semibold text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="customer">Customer Bill</option>
                  <option value="chef">Kitchen KOT</option>
                  <option value="both">Both (KOT + Bill)</option>
                </select>
              </div>
            )}
          </div>

          {/* Remember Choice Toggle */}
          <div className="flex items-center gap-2.5 pt-2">
            <input
              type="checkbox"
              id="rememberChoice"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-orange-500 focus:ring-orange-500"
            />
            <label htmlFor="rememberChoice" className="text-xs text-neutral-300 select-none cursor-pointer">
              Remember this choice (one-tap printing without asking)
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-neutral-800 bg-neutral-900/90 px-5 py-3.5 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestPrint}
            disabled={isPrinting}
            className="text-xs font-bold border-neutral-700 hover:bg-neutral-800"
          >
            {isPrinting ? <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" /> : null}
            Test Print Slip
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs font-bold border-neutral-700"
            >
              Close
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handlePrintCurrent}
              disabled={isPrinting}
              className="bg-orange-600 hover:bg-orange-700 text-white font-black text-xs px-4"
            >
              {isPrinting ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="mr-1.5 h-3.5 w-3.5" />
              )}
              {pendingOrder ? "Print Order" : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

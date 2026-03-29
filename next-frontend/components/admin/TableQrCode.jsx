"use client";

import { useCallback, useEffect, useRef } from "react";
import QRCode from "qrcode";

/**
 * Renders a table ordering URL as a QR in the browser (no image GET to the API).
 * Optional brandedPngUrl: server-generated PNG with logo for one-off download.
 */
export function TableQrCode({
  value,
  size = 160,
  downloadFileName = "table-qr.png",
  brandedPngUrl = "",
  brandedLabel = "Download with logo",
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    let cancelled = false;
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "H",
    }).catch(() => {
      if (!cancelled && canvas.getContext("2d")) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  const downloadPng = useCallback(async () => {
    if (!value) return;
    try {
      const dataUrl = await QRCode.toDataURL(value, {
        width: Math.max(size, 512),
        margin: 1,
        errorCorrectionLevel: "H",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = downloadFileName;
      a.rel = "noopener";
      a.click();
    } catch {
      // ignore
    }
  }, [value, size, downloadFileName]);

  if (!value) {
    return (
      <p className="max-w-[200px] text-center text-xs text-amber-800">
        Add a public ordering URL (Cafe branding or NEXT_PUBLIC_CUSTOMER_APP_URL) to build the table link.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        className="h-40 w-40 rounded-xl border border-orange-100 bg-white"
        style={{ width: size, height: size }}
        width={size}
        height={size}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={downloadPng}
          className="inline-flex items-center justify-center rounded-full border-2 border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100"
        >
          Download QR
        </button>
        {brandedPngUrl ? (
          <a
            className="inline-flex items-center justify-center rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-900 shadow-sm hover:bg-orange-100"
            href={brandedPngUrl}
            download={downloadFileName.replace(/\.png$/i, "-branded.png")}
            rel="noopener noreferrer"
          >
            {brandedLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}

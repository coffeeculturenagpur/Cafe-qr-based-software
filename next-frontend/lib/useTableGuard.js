"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { getTableSession, setTableSession } from "./tableSession";
import { fetchSessionRestore } from "./sessionRestore";

export function useTableGuard({
  cafeId,
  tableNumber,
  token,
  router,
  redirectTo,
}) {
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cafeId) return;
    const session = getTableSession(cafeId);
    const hasTable = tableNumber !== null && tableNumber !== undefined && tableNumber !== "";
    const hasToken = Boolean(token);

    if (!hasTable || !hasToken) {
      if (session?.tableNumber && session?.token && redirectTo) {
        router.replace(redirectTo(session.tableNumber, session.token));
        return;
      }

      let cancelled = false;
      setStatus("checking");
      setError("");

      (async () => {
        try {
          const restored = await fetchSessionRestore(cafeId);
          if (cancelled) return;
          const tableContext = restored?.tableContext;
          if (tableContext?.tableNumber && tableContext?.token && redirectTo) {
            setTableSession(cafeId, tableContext.tableNumber, tableContext.token);
            router.replace(redirectTo(tableContext.tableNumber, tableContext.token));
            return;
          }
          setStatus("error");
          setError("Invalid or missing table link. Please scan the table QR again.");
        } catch (e) {
          if (cancelled) return;
          setStatus("error");
          setError(e?.message || "Invalid or missing table link. Please scan the table QR again.");
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    if (
      session &&
      String(session.tableNumber) === String(tableNumber) &&
      String(session.token) === String(token)
    ) {
      setStatus("ok");
      setError("");
      return;
    }

    let cancelled = false;
    setStatus("checking");
    setError("");

    (async () => {
      try {
        await apiFetch(
          `/api/qr/verify?cafeId=${encodeURIComponent(cafeId)}&tableNumber=${encodeURIComponent(
            tableNumber
          )}&t=${encodeURIComponent(token)}`
        );
        if (cancelled) return;
        setTableSession(cafeId, tableNumber, token);
        setStatus("ok");
      } catch (e) {
        if (cancelled) return;
        if (session?.tableNumber && session?.token && redirectTo) {
          router.replace(redirectTo(session.tableNumber, session.token));
          return;
        }
        setStatus("error");
        setError(e?.message || "Invalid table link. Please scan the table QR again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cafeId, tableNumber, token, router, redirectTo]);

  return { status, error };
}

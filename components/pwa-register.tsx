"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister();
        });
      });
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key.startsWith("workout-tracker-")) {
              caches.delete(key);
            }
          });
        });
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // no-op
    });
  }, []);

  return null;
}

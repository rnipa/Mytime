import { useEffect, useRef, useState } from "react";
import { putItem, uid } from "../db/indexedDb";
import {
  AppPreferences,
  LocationEvent,
  NotificationSetting,
  Shop,
  TimeSession,
} from "../types/domain";
import { haversineDistanceMeters } from "../utils/dhakaTime";

export interface GeofenceState {
  permissionStatus: "granted" | "denied" | "prompt" | "unsupported";
  currentDistanceMeters: number | null;
  currentAccuracyMeters: number | null;
  lastFixAt: number | null;
  pendingTransition: {
    type: "ENTER" | "EXIT";
    detectedAt: number;
    confirmAt: number;
  } | null;
  errorMessage: string | null;
}

export function sendBrowserNotification(
  title: string,
  body: string,
  settings: NotificationSetting[],
  type: NotificationSetting["type"]
) {
  const cfg = settings.find((s) => s.type === type);
  if (cfg && !cfg.enabled) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      // Ignore notification errors in restricted contexts
    }
  }
}

export function useGeofenceTracker(params: {
  shop: Shop | null;
  prefs: AppPreferences;
  activeSession: TimeSession | null;
  notificationSettings: NotificationSetting[];
  onTriggerAutoCheckIn: (event: LocationEvent) => Promise<void>;
  onTriggerAutoCheckOut: (event: LocationEvent) => Promise<void>;
  onNewPendingEvent: () => Promise<void>;
}) {
  const [state, setState] = useState<GeofenceState>({
    permissionStatus: typeof navigator !== "undefined" && "geolocation" in navigator ? "prompt" : "unsupported",
    currentDistanceMeters: null,
    currentAccuracyMeters: null,
    lastFixAt: null,
    pendingTransition: null,
    errorMessage: null,
  });

  const pendingTimerRef = useRef<number | null>(null);
  const lastCommittedTypeRef = useRef<"ENTER" | "EXIT" | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((res) => {
          setState((s) => ({ ...s, permissionStatus: res.state }));
          res.onchange = () => {
            setState((s) => ({ ...s, permissionStatus: res.state }));
          };
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const { shop, prefs } = params;
    if (
      !prefs.gpsEnabled ||
      prefs.gpsPaused ||
      !shop ||
      shop.latitude === null ||
      shop.longitude === null ||
      typeof navigator === "undefined" ||
      !("geolocation" in navigator)
    ) {
      if (pendingTimerRef.current) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      setState((s) => ({ ...s, pendingTransition: null }));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latest = paramsRef.current;
        if (!latest.shop || latest.shop.latitude === null || latest.shop.longitude === null) return;

        const dist = haversineDistanceMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          latest.shop.latitude,
          latest.shop.longitude
        );
        const accuracy = pos.coords.accuracy ?? 50;
        const effectiveRadius = latest.shop.geofenceRadius;
        const isInside = dist <= effectiveRadius;
        const hasActive = Boolean(latest.activeSession);

        setState((s) => ({
          ...s,
          permissionStatus: "granted",
          currentDistanceMeters: Math.round(dist),
          currentAccuracyMeters: Math.round(accuracy),
          lastFixAt: pos.timestamp || Date.now(),
          errorMessage: null,
        }));

        // Ignore very noisy fixes (> 150m accuracy)
        if (accuracy > 150) return;

        const desiredTransition: "ENTER" | "EXIT" | null =
          isInside && !hasActive ? "ENTER" : !isInside && hasActive ? "EXIT" : null;

        if (!desiredTransition) {
          if (pendingTimerRef.current) {
            window.clearTimeout(pendingTimerRef.current);
            pendingTimerRef.current = null;
            setState((s) => ({ ...s, pendingTransition: null }));
          }
          return;
        }

        // Prevent duplicate back-to-back events of the same type
        if (lastCommittedTypeRef.current === desiredTransition && !pendingTimerRef.current) {
          return;
        }

        // Already waiting for this exact transition
        setState((prev) => {
          if (prev.pendingTransition?.type === desiredTransition) {
            return prev;
          }
          if (pendingTimerRef.current) {
            window.clearTimeout(pendingTimerRef.current);
          }
          const delayMs = Math.max(5, latest.prefs.gpsConfirmationDelaySec) * 1000;
          const now = Date.now();

          pendingTimerRef.current = window.setTimeout(async () => {
            pendingTimerRef.current = null;
            const current = paramsRef.current;
            const event: LocationEvent = {
              id: uid("loc"),
              timestamp: Date.now(),
              eventType: desiredTransition,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: Math.round(accuracy),
              source: "GPS",
              status: current.prefs.gpsAutoConfirm ? "AUTO_APPLIED" : "PENDING_REVIEW",
              distanceMeters: Math.round(dist),
              note:
                desiredTransition === "ENTER"
                  ? "Geofence arrival confirmed"
                  : "Geofence departure confirmed",
            };
            await putItem("locationEvents", event);
            lastCommittedTypeRef.current = desiredTransition;

            if (current.prefs.gpsAutoConfirm) {
              if (desiredTransition === "ENTER") {
                await current.onTriggerAutoCheckIn(event);
              } else {
                await current.onTriggerAutoCheckOut(event);
              }
            } else {
              sendBrowserNotification(
                current.prefs.language === "bn"
                  ? desiredTransition === "ENTER"
                    ? "আপনি কি দোকানে পৌঁছেছেন?"
                    : "আপনি কি দোকান থেকে বের হয়েছেন?"
                  : desiredTransition === "ENTER"
                    ? "Arrived at Shop?"
                    : "Left Shop Geofence?",
                current.prefs.language === "bn"
                  ? desiredTransition === "ENTER"
                    ? "দোকানের জিওফেন্সে প্রবেশ শনাক্ত হয়েছে। ট্র্যাকিং শুরু করবেন?"
                    : "দোকানের সীমানা থেকে প্রস্থান শনাক্ত হয়েছে। সেশন বন্ধ করবেন?"
                  : desiredTransition === "ENTER"
                    ? "You entered the shop geofence. Start tracking?"
                    : "You exited the shop geofence. Close active session?",
                current.notificationSettings,
                desiredTransition === "ENTER" ? "GPS_ARRIVAL" : "GPS_DEPARTURE"
              );
              await current.onNewPendingEvent();
            }
            setState((s) => ({ ...s, pendingTransition: null }));
          }, delayMs);

          return {
            ...prev,
            pendingTransition: {
              type: desiredTransition,
              detectedAt: now,
              confirmAt: now + delayMs,
            },
          };
        });
      },
      (err) => {
        setState((s) => ({
          ...s,
          permissionStatus: err.code === 1 ? "denied" : s.permissionStatus,
          errorMessage: err.message,
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (pendingTimerRef.current) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [
    params.prefs.gpsEnabled,
    params.prefs.gpsPaused,
    params.shop?.id,
    params.shop?.latitude,
    params.shop?.longitude,
    params.shop?.geofenceRadius,
  ]);

  return state;
}

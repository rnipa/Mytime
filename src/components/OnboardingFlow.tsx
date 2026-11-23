import React, { useEffect, useState } from "react";
import { ArrowRight, Check, Compass, Download, Lock, MapPin, ShieldCheck, Smartphone, Store } from "lucide-react";
import { putItem, uid } from "../db/indexedDb";
import { AppPreferences, GoalSettings, Shop } from "../types/domain";
import { hashPin } from "../utils/dhakaTime";

export const PinLockScreen: React.FC<{
  prefs: AppPreferences;
  onUnlock: () => void;
}> = ({ prefs, onUnlock }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const lang = prefs.language;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefs.pinHash) {
      onUnlock();
      return;
    }
    const h = await hashPin(pin);
    if (h === prefs.pinHash) {
      onUnlock();
    } else {
      setError(lang === "bn" ? "পিন সঠিক নয়। আবার চেষ্টা করুন।" : "Incorrect PIN. Try again.");
      setPin("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#090D0B] px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-7 space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">SHOP TIME MASTER</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {lang === "bn" ? "অ্যাপ আনলক করতে পিন দিন" : "Enter your 4-digit PIN to unlock"}
            </p>
          </div>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError("");
          }}
          placeholder="••••"
          autoFocus
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-center text-xl tracking-[0.4em] font-mono-tabular text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button
          type="submit"
          className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
        >
          {lang === "bn" ? "আনলক করুন" : "Unlock"}
        </button>
      </form>
    </div>
  );
};

export const OnboardingFlow: React.FC<{
  prefs: AppPreferences;
  shop: Shop | null;
  goalSettings: GoalSettings;
  onComplete: () => Promise<void>;
}> = ({ prefs, shop, goalSettings, onComplete }) => {
  const [step, setStep] = useState<"ONBOARDING" | "SHOP_SETUP" | "LOCATION_PERMISSION">(
    !prefs.onboardingCompleted
      ? "ONBOARDING"
      : !prefs.shopSetupCompleted
        ? "SHOP_SETUP"
        : "LOCATION_PERMISSION"
  );
  const [slideIdx, setSlideIdx] = useState(0);
  const [lang, setLang] = useState<"bn" | "en">(prefs.language);
  const [apkInfo, setApkInfo] = useState<{
    available: boolean;
    sizeBytes: number;
    filename: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/android-project/apk-info")
      .then((r) => r.json())
      .then((d) => setApkInfo(d))
      .catch(() => {});
  }, []);

  const [shopName, setShopName] = useState(shop?.name ?? "");
  const [shopAddress, setShopAddress] = useState(shop?.address ?? "");
  const [lat, setLat] = useState(shop?.latitude !== null && shop?.latitude !== undefined ? String(shop.latitude) : "");
  const [lng, setLng] = useState(shop?.longitude !== null && shop?.longitude !== undefined ? String(shop.longitude) : "");
  const [radius, setRadius] = useState(shop?.geofenceRadius ?? 100);
  const [dailyHours, setDailyHours] = useState(Math.round(goalSettings.dailyMinutes / 60));
  const [prefStart, setPrefStart] = useState(goalSettings.preferredStart);
  const [prefEnd, setPrefEnd] = useState(goalSettings.preferredEnd);
  const [locMsg, setLocMsg] = useState("");
  const [formErr, setFormErr] = useState("");

  const slides =
    lang === "bn"
      ? [
          {
            title: "দোকানে আপনার প্রকৃত সময় জানুন",
            body: "ম্যানুয়াল Check In/Out এবং ঐচ্ছিক জিপিএস জিওফেন্সের মাধ্যমে দোকানে উপস্থিতি ও বাইরে কাটানো সময় আলাদাভাবে হিসাব করুন।",
          },
          {
            title: "ব্যবসায়িক বনাম ব্যক্তিগত সময়",
            body: "ব্যাংক বা মালামাল সংগ্রহের সময় ব্যবসায়িক কর্মঘণ্টায় যুক্ত হবে; ব্যক্তিগত বিরতি আলাদা থাকায় সময়ের অপচয় সহজেই ধরা পড়বে।",
          },
          {
            title: "ঘণ্টাপ্রতি প্রকৃত আয় ও লাভ (৳)",
            body: "মাসিক বিক্রয় ও নিট লাভের সাথে কর্মঘণ্টার তুলনা করে দেখুন আপনার দোকানের প্রতিটি ঘণ্টার আর্থিক মূল্য কত।",
          },
        ]
      : [
          {
            title: "Know Your Real Time at the Shop",
            body: "Combine reliable manual Check In/Out with optional GPS geofencing to track physical shop presence accurately.",
          },
          {
            title: "Separate Business vs Personal Outside Time",
            body: "Banking and stock collection count toward business work, while personal breaks stay separate so time leakage becomes visible.",
          },
          {
            title: "Measure Revenue & Profit Per Hour (৳)",
            body: "Compare monthly sales and net profit against actual working hours to understand the true financial value of your time.",
          },
        ];

  const handleLanguageSwitch = async (nextLang: "bn" | "en") => {
    setLang(nextLang);
    await putItem("preferences", {
      ...prefs,
      language: nextLang,
      numberFormat: nextLang,
    });
  };

  const handleFinishSlides = async () => {
    await putItem("preferences", {
      ...prefs,
      language: lang,
      numberFormat: lang,
      onboardingCompleted: true,
    });
    setStep("SHOP_SETUP");
  };

  const handleCaptureCurrentGps = () => {
    if (!("geolocation" in navigator)) {
      setLocMsg(lang === "bn" ? "এই ব্রাউজারে জিপিএস সমর্থিত নয়।" : "Geolocation is not supported.");
      return;
    }
    setLocMsg(lang === "bn" ? "অবস্থান নির্ণয় করা হচ্ছে..." : "Capturing current GPS coordinates...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocMsg(
          lang === "bn"
            ? `সফলভাবে সংরক্ষিত (±${Math.round(pos.coords.accuracy)} মি.)`
            : `Captured (±${Math.round(pos.coords.accuracy)}m accuracy)`
        );
      },
      (err) => {
        setLocMsg(err.message);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) {
      setFormErr(lang === "bn" ? "দোকানের নাম লিখুন।" : "Please enter your shop name.");
      return;
    }
    const parsedLat = lat.trim() ? Number(lat) : null;
    const parsedLng = lng.trim() ? Number(lng) : null;
    const newShop: Shop = {
      id: shop?.id ?? uid("shop"),
      name: shopName.trim(),
      address: shopAddress.trim(),
      latitude: Number.isFinite(parsedLat) ? parsedLat : null,
      longitude: Number.isFinite(parsedLng) ? parsedLng : null,
      geofenceRadius: radius,
      createdAt: shop?.createdAt ?? Date.now(),
    };
    await putItem("shops", newShop);
    await putItem("goalSettings", {
      ...goalSettings,
      dailyMinutes: Math.max(60, dailyHours * 60),
      weeklyMinutes: Math.max(60, dailyHours * 60 * 6),
      monthlyMinutes: Math.max(60, dailyHours * 60 * 26),
      preferredStart: prefStart,
      preferredEnd: prefEnd,
    });
    await putItem("preferences", {
      ...prefs,
      language: lang,
      numberFormat: lang,
      onboardingCompleted: true,
      shopSetupCompleted: true,
    });
    setStep("LOCATION_PERMISSION");
  };

  const handleLocationDecision = async (enableGps: boolean) => {
    if (enableGps && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
    await putItem("preferences", {
      ...prefs,
      language: lang,
      numberFormat: lang,
      onboardingCompleted: true,
      shopSetupCompleted: true,
      locationPromptSeen: true,
      gpsEnabled: enableGps,
    });
    await onComplete();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#090D0B] text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <span className="font-bold tracking-tight text-base">SHOP TIME MASTER</span>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => handleLanguageSwitch("bn")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                lang === "bn"
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch("en")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                lang === "en"
                  ? "bg-emerald-600 text-white"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              English
            </button>
          </div>
        </div>

        {step === "ONBOARDING" && (
          <div className="space-y-6 py-2">
            <div className="space-y-3">
              <div className="text-xs font-medium text-emerald-500">
                {lang === "bn" ? `ধাপ ${slideIdx + 1} / ৩` : `Step ${slideIdx + 1} of 3`}
              </div>
              <h1 className="text-2xl font-bold leading-snug text-balance">
                {slides[slideIdx].title}
              </h1>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {slides[slideIdx].body}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSlideIdx(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === slideIdx ? "w-8 bg-emerald-500" : "w-3 bg-zinc-300 dark:bg-zinc-700"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleFinishSlides}
                className="min-h-[44px] px-4 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                {lang === "bn" ? "এড়িয়ে যান" : "Skip"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (slideIdx < slides.length - 1) setSlideIdx(slideIdx + 1);
                  else handleFinishSlides();
                }}
                className="min-h-[48px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <span>
                  {slideIdx < slides.length - 1
                    ? lang === "bn"
                      ? "পরবর্তী"
                      : "Next"
                    : lang === "bn"
                      ? "দোকান সেটআপ শুরু করুন"
                      : "Configure Shop"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === "SHOP_SETUP" && (
          <form onSubmit={handleSaveShop} className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">
                {lang === "bn" ? "আপনার দোকানের তথ্য দিন" : "Shop Setup"}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {lang === "bn"
                  ? "সমস্ত তথ্য আপনার ডিভাইসেই অফলাইনে সুরক্ষিত থাকবে।"
                  : "All data stays private and offline on your device."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {lang === "bn" ? "দোকানের নাম *" : "Shop Name *"}
              </label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => {
                  setShopName(e.target.value);
                  setFormErr("");
                }}
                placeholder={lang === "bn" ? "যেমন: হাসান এন্টারপ্রাইজ" : "e.g., Hasan Enterprise"}
                className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {lang === "bn" ? "ঠিকানা (ঐচ্ছিক)" : "Shop Address (Optional)"}
              </label>
              <input
                type="text"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder={lang === "bn" ? "মিরপুর-১০, ঢাকা" : "Mirpur-10, Dhaka"}
                className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">
                  {lang === "bn" ? "দৈনিক লক্ষ্য (ঘণ্টা)" : "Daily Goal (hrs)"}
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={dailyHours}
                  onChange={(e) => setDailyHours(Number(e.target.value) || 10)}
                  className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">
                  {lang === "bn" ? "খোলার সময়" : "Preferred Open"}
                </label>
                <input
                  type="time"
                  value={prefStart}
                  onChange={(e) => setPrefStart(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">
                  {lang === "bn" ? "বন্ধের সময়" : "Preferred Close"}
                </label>
                <input
                  type="time"
                  value={prefEnd}
                  onChange={(e) => setPrefEnd(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  {lang === "bn" ? "দোকানের জিপিএস অবস্থান (ঐচ্ছিক)" : "Shop GPS Location (Optional)"}
                </span>
                <button
                  type="button"
                  onClick={handleCaptureCurrentGps}
                  className="min-h-[40px] px-3 rounded-lg border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5" />
                  {lang === "bn" ? "বর্তমান অবস্থান নিন" : "Use Current GPS"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="Lat (23.8103)"
                  className="h-10 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs font-mono-tabular"
                />
                <input
                  type="text"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="Lng (90.4125)"
                  className="h-10 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs font-mono-tabular"
                />
                <input
                  type="number"
                  min={30}
                  max={1000}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value) || 100)}
                  placeholder="100m"
                  className="h-10 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs font-mono-tabular"
                />
              </div>
              {locMsg && <p className="text-xs text-emerald-500">{locMsg}</p>}
            </div>

            {formErr && <p className="text-xs text-rose-500">{formErr}</p>}

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Check className="w-4 h-4" />
              {lang === "bn" ? "সংরক্ষণ করে এগিয়ে যান" : "Save & Continue"}
            </button>
          </form>
        )}

        {step === "LOCATION_PERMISSION" && (
          <div className="space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">
                {lang === "bn" ? "লোকেশন অনুমতি ও গোপনীয়তা" : "Location Permission & Privacy"}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {lang === "bn"
                  ? "আপনি দোকানে প্রবেশ বা প্রস্থান করলে স্বয়ংক্রিয়ভাবে রিমাইন্ডার দেওয়ার জন্যই শুধুমাত্র অবস্থান ব্যবহার করা হয়। কোনো গোপন ট্র্যাকিং বা ক্লাউডে লোকেশন পাঠানো হয় না।"
                  : "Location is used solely to detect arrival/departure at your shop geofence. We never track secretly or upload your location history to any cloud."}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-200 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                {lang === "bn"
                  ? "অনুমতি না দিলেও ম্যানুয়াল Check In/Out সম্পূর্ণ কাজ করবে।"
                  : "Manual Check In/Out works 100% even if location permission is declined."}
              </div>
              <p>
                {lang === "bn"
                  ? "যেকোনো সময় সেটিংস থেকে জিপিএস থামাতে বা বন্ধ করতে পারবেন।"
                  : "You can pause or disable GPS tracking anytime from Tracker or Settings."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => handleLocationDecision(false)}
                className="min-h-[48px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {lang === "bn" ? "শুধু ম্যানুয়াল ব্যবহার করুন" : "Use Manual Only"}
              </button>
              <button
                type="button"
                onClick={() => handleLocationDecision(true)}
                className="min-h-[48px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
              >
                {lang === "bn" ? "জিপিএস অনুমতি দিন" : "Enable GPS Geofence"}
              </button>
            </div>
          </div>
        )}
      </div>

      {apkInfo?.available && (
        <div className="w-full max-w-xl mt-4 rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#111714] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {apkInfo.filename}
              </div>
              <div className="text-[11px] text-zinc-500 font-mono-tabular">
                {(apkInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB · Android Debug APK
              </div>
            </div>
          </div>
          <a
            href="/api/android-project/apk"
            download="SHOP-TIME-MASTER-v1.0.0-debug.apk"
            className="min-h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>{lang === "bn" ? "APK ডাউনলোড" : "Download APK"}</span>
          </a>
        </div>
      )}
    </div>
  );
};

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, RefreshCw, WifiOff } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const installDismissedKey = "incoc:pwa-install-dismissed";
let registrationRequest: Promise<ServiceWorkerRegistration> | null = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isAppleMobileBrowser() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaExperience() {
  const { pathname } = useLocation();
  const [online, setOnline] = useState(navigator.onLine);
  const [installed, setInstalled] = useState(isStandalone());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(installDismissedKey) === "true";
    } catch (error) {
      console.warn("Unable to read the install-prompt preference.", error);
      return false;
    }
  });
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    if ("indexedDB" in window) {
      try {
        const request = window.indexedDB.deleteDatabase("incoc-south-offline");
        request.onerror = () => console.error("Unable to remove legacy offline content storage.", request.error);
        request.onblocked = () => console.error("Legacy offline content storage is still open in another tab.");
      } catch (error) {
        console.error("Unable to remove legacy offline content storage.", error);
      }
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
    let active = true;
    let registration: ServiceWorkerRegistration | null = null;
    let hadController = Boolean(navigator.serviceWorker.controller);

    const showWaitingWorker = () => {
      if (registration?.waiting && navigator.serviceWorker.controller) {
        setUpdateRegistration(registration);
      }
    };
    const updateWorker = () => {
      if (registration && navigator.onLine) void registration.update().catch((error: unknown) => {
        console.warn("Unable to check for an INCOC South update.", error);
      });
    };
    const onControllerChange = () => {
      if (hadController) window.location.reload();
      else hadController = true;
    };

    if (!registrationRequest) registrationRequest = navigator.serviceWorker.register("/sw.js", { scope: "/" });
    void registrationRequest.then((result) => {
      if (!active) return;
      registration = result;
      showWaitingWorker();
      result.addEventListener("updatefound", () => {
        const installingWorker = result.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", showWaitingWorker);
      });
      window.addEventListener("online", updateWorker);
      updateWorker();
    }).catch((error: unknown) => {
      registrationRequest = null;
      console.error("Unable to register the INCOC South service worker.", error);
    });
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      active = false;
      window.removeEventListener("online", updateWorker);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  async function installApplication() {
    if (!installPrompt) {
      setShowIosInstructions(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
    else dismissInstallOption();
  }

  function dismissInstallOption() {
    setDismissed(true);
    try {
      window.localStorage.setItem(installDismissedKey, "true");
    } catch (error) {
      console.warn("Unable to save the install-prompt preference.", error);
    }
  }

  function activateUpdate() {
    const waitingWorker = updateRegistration?.waiting;
    if (!waitingWorker) return;
    setUpdating(true);
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  const showInstall = !installed && !dismissed && (Boolean(installPrompt) || isAppleMobileBrowser());
  const immersivePresentation = pathname === "/slides"
    || pathname.startsWith("/present/")
    || pathname === "/announcement/slides";
  const showUpdate = updateRegistration && !immersivePresentation;

  return <>
    {!online && <div className="pwa-status" role="status">
      <WifiOff size={15} aria-hidden="true" />
      <span>Offline — live content updates are paused.</span>
    </div>}
    {(showInstall || showUpdate) && <div className="pwa-floating-controls">
      {showInstall && <section className="pwa-install-card" aria-label="Install INCOC South">
        <button type="button" className="pwa-install-button" onClick={() => void installApplication()}>
          <Download size={16} aria-hidden="true" />
          <span>Install INCOC South</span>
        </button>
        {showIosInstructions && isAppleMobileBrowser() && <p className="pwa-ios-instructions">
          In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </p>}
        <button type="button" className="pwa-dismiss-button" onClick={dismissInstallOption}>Not now</button>
      </section>}
      {showUpdate && <section className="pwa-update-card" role="status" aria-label="Application update available">
        <span>A new version of INCOC South is ready.</span>
        <button type="button" className="pwa-update-button" onClick={activateUpdate} disabled={updating}>
          <RefreshCw size={15} aria-hidden="true" />
          {updating ? "Updating…" : "Update now"}
        </button>
      </section>}
    </div>}
  </>;
}

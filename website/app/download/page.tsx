"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Apple, Smartphone, ArrowLeft } from "lucide-react";
import { trackAppDownload } from "@/lib/mixpanel";

type Platform = "ios" | "android";

const ANDROID_APK_URL =
  "https://github.com/shantamg/meet-without-fear/releases/download/android-beta-latest/meet-without-fear.apk";

export default function DownloadPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("ios");

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor;

    if (/android/i.test(userAgent)) {
      setSelectedPlatform("android");
    } else if (/iPad|iPhone|iPod/.test(userAgent)) {
      setSelectedPlatform("ios");
    }
  }, []);

  const testFlightUrl = process.env.NEXT_PUBLIC_TESTFLIGHT_URL || "https://testflight.apple.com/join/YOUR_CODE";
  const androidApkUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL || ANDROID_APK_URL;

  const handleDownloadClick = (platform: Platform) => {
    trackAppDownload(platform, "download_page");
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Meet Without Fear" width={48} height={40} />
            <span className="hidden min-[430px]:inline font-display text-xl italic text-foreground">meet without fear</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          {/* Title */}
          <h1 className="font-display text-4xl md:text-5xl mb-4">
            Get the App
          </h1>
          <p className="text-muted-foreground text-lg mb-10">
            Download Meet Without Fear to start transforming your conversations.
          </p>

          {/* Platform Selector */}
          <div className="flex justify-center gap-4 mb-10">
            <button
              onClick={() => setSelectedPlatform("ios")}
              className={`flex items-center gap-3 px-6 py-4 rounded-xl font-semibold transition-all ${
                selectedPlatform === "ios"
                  ? "bg-accent text-accent-foreground"
                  : "bg-card border border-border text-foreground hover:border-accent"
              }`}
            >
              <Apple className="w-6 h-6" />
              <span>iOS</span>
            </button>
            <button
              onClick={() => setSelectedPlatform("android")}
              className={`flex items-center gap-3 px-6 py-4 rounded-xl font-semibold transition-all ${
                selectedPlatform === "android"
                  ? "bg-accent text-accent-foreground"
                  : "bg-card border border-border text-foreground hover:border-accent"
              }`}
            >
              <Smartphone className="w-6 h-6" />
              <span>Android</span>
            </button>
          </div>

          {/* Download Section */}
          <div>
            {selectedPlatform === "ios" ? (
              <div className="space-y-8">
                {/* QR Code for desktop only */}
                <div className="hidden md:inline-block bg-card border border-border rounded-2xl p-8">
                  <div className="w-48 h-48 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 p-2">
                    <Image
                      src="/testflight-qr.png"
                      alt="QR Code to download from TestFlight"
                      width={176}
                      height={176}
                      className="rounded-lg"
                    />
                  </div>
                  <p className="text-muted-foreground text-sm mb-4">
                    Scan with your iPhone to download
                  </p>
                  <a
                    href={testFlightUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleDownloadClick("ios")}
                  className="text-brand-orange hover:underline text-sm"
                  >
                    Or open TestFlight link directly →
                  </a>
                </div>

                {/* Download button for mobile only */}
                <a
                  href={testFlightUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleDownloadClick("ios")}
                  className="md:hidden inline-flex items-center justify-center gap-3 bg-brand-orange text-accent-foreground px-8 py-4 rounded-full font-medium text-lg transition-all hover:opacity-90"
                >
                  <Apple className="w-6 h-6" />
                  Download from TestFlight
                </a>

                {/* Desktop description */}
                <p className="hidden md:block text-muted-foreground text-sm max-w-md mx-auto">
                  The app is currently in beta testing via Apple TestFlight. Scan the QR code with your iPhone to download.
                </p>

                {/* Mobile description */}
                <p className="md:hidden text-muted-foreground text-sm max-w-md mx-auto">
                  Tap the button to open TestFlight and install the app.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Download button for mobile only */}
                {androidApkUrl ? (
                  <a
                    href={androidApkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    onClick={() => handleDownloadClick("android")}
                    className="md:hidden inline-flex items-center justify-center gap-3 bg-brand-orange text-accent-foreground px-8 py-4 rounded-full font-medium text-lg transition-all hover:opacity-90"
                  >
                    <Smartphone className="w-6 h-6" />
                    Download APK
                  </a>
                ) : (
                  <p className="md:hidden text-muted-foreground text-sm max-w-md mx-auto">
                    Android beta download is temporarily unavailable.
                  </p>
                )}

                {/* Android Instructions for mobile only */}
                <div className="md:hidden bg-card border border-border rounded-2xl p-6 text-left max-w-md mx-auto">
                  <h3 className="text-brand-orange font-semibold mb-4">Installation Instructions</h3>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Android 8.0 and higher:</strong>{" "}
                      Navigate to Settings → Apps → Special access → Install unknown apps,
                      then enable for your browser.
                    </p>
                    <p>
                      <strong className="text-foreground">Android 7.1.1 and lower:</strong>{" "}
                      Go to Settings → Security and enable &quot;Unknown sources&quot;.
                    </p>
                  </div>
                </div>

                {/* Message for desktop only */}
                <div className="hidden md:inline-block bg-card border border-border rounded-2xl p-8">
                  <Smartphone className="w-16 h-16 text-brand-orange mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm max-w-md">
                    Android download is available on your Android device.
                    Visit this page on your phone to download the APK.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

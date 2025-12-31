"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Apple, Smartphone, ArrowLeft } from "lucide-react";

type Platform = "ios" | "android";

export default function AppDownloadPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("ios");

  useEffect(() => {
    // Detect platform on mount to set default tab
    const userAgent = navigator.userAgent || navigator.vendor;

    if (/android/i.test(userAgent)) {
      setSelectedPlatform("android");
    } else if (/iPad|iPhone|iPod/.test(userAgent)) {
      setSelectedPlatform("ios");
    }
  }, []);

  const testFlightUrl = process.env.NEXT_PUBLIC_TESTFLIGHT_URL || "https://testflight.apple.com/join/YOUR_CODE";
  const androidApkUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL || "https://github.com/YOUR_ORG/releases/latest/download/app.apk";

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Meet Without Fear" width={40} height={24} />
            <span className="text-xl font-bold text-accent">Meet Without Fear</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
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
                  : "bg-card border border-border text-foreground hover:border-accent/50"
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
                  : "bg-card border border-border text-foreground hover:border-accent/50"
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
                    className="text-accent hover:underline text-sm"
                  >
                    Or open TestFlight link directly →
                  </a>
                </div>

                {/* Download button for mobile only */}
                <a
                  href={testFlightUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="md:hidden inline-flex items-center justify-center gap-3 bg-accent text-accent-foreground px-8 py-4 rounded-xl font-semibold text-lg hover:bg-accent/90 transition-all"
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
                <a
                  href={androidApkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="md:hidden inline-flex items-center justify-center gap-3 bg-accent text-accent-foreground px-8 py-4 rounded-xl font-semibold text-lg hover:bg-accent/90 transition-all"
                >
                  <Smartphone className="w-6 h-6" />
                  Download APK
                </a>

                {/* Android Instructions for mobile only */}
                <div className="md:hidden bg-card border border-border rounded-2xl p-6 text-left max-w-md mx-auto">
                  <h3 className="text-accent font-semibold mb-4">Installation Instructions</h3>
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
                  <Smartphone className="w-16 h-16 text-accent mx-auto mb-4" />
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

import Link from "next/link";
import { ArrowRight, Shield, Heart, MessageCircle, Users } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-accent">Meet Without Fear</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/app"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Get the App
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
            Meet Without Fear
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10">
            Transform difficult conversations into opportunities for connection and understanding.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-8 py-4 rounded-xl font-semibold text-lg hover:bg-accent/90 transition-all hover:scale-105"
            >
              Get Started
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-card/50">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Meet Without Fear?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={<Heart className="w-8 h-8 text-accent" />}
              title="Build Connection"
              description="Strengthen your relationships through guided, meaningful conversations."
            />
            <FeatureCard
              icon={<MessageCircle className="w-8 h-8 text-accent" />}
              title="AI-Guided Support"
              description="Receive gentle, personalized guidance to navigate difficult topics."
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8 text-accent" />}
              title="Safe Space"
              description="Your conversations are private and secure, creating a judgment-free zone."
            />
            <FeatureCard
              icon={<Users className="w-8 h-8 text-accent" />}
              title="Together"
              description="Work through challenges as partners, not adversaries."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Start?</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Download the app and begin your journey toward better communication and deeper connection.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-8 py-4 rounded-xl font-semibold text-lg hover:bg-accent/90 transition-all hover:scale-105"
          >
            Download the App
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          <p>&copy; {new Date().getFullYear()} Meet Without Fear. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card p-6 rounded-xl border border-border hover:border-accent/50 transition-all">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

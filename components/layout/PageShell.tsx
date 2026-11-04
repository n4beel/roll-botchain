import React from "react";
import Link from "next/link";
import ConnectButton from "../ui/ConnectButton";
import BuiltOnBotChain from "../botchain/BuiltOnBotChain";
import { footerLinks } from "@/lib/botchain/chain";

export interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  activeTab?: "rolls" | "open" | "me";
}

export function PageShell({
  children,
  title,
  subtitle,
  badge,
  action,
  activeTab = "rolls",
}: PageShellProps) {
  const { site, explorer } = footerLinks();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Main App Navigation Bar */}
      <header className="border-b-2 border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-3 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-baseline gap-2 font-serif text-2xl font-black tracking-tight hover:opacity-85">
              <span>ROLL</span>
              <span className="text-xs uppercase tracking-widest px-1.5 py-0.5 bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-strong)] font-sans font-bold">
                Pigeonholes
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-2 text-sm font-medium">
              <Link
                href="/"
                className={`px-2.5 py-1 transition-all ${
                  activeTab === "rolls"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-[2px_2px_0px_var(--text-primary)]"
                    : "hover:underline underline-offset-4"
                }`}
              >
                Rolls
              </Link>
              <Link
                href="/open"
                className={`px-2.5 py-1 transition-all ${
                  activeTab === "open"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-[2px_2px_0px_var(--text-primary)]"
                    : "hover:underline underline-offset-4"
                }`}
              >
                Open Club
              </Link>
              <Link
                href="/me"
                className={`px-2.5 py-1 transition-all ${
                  activeTab === "me"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-[2px_2px_0px_var(--text-primary)]"
                    : "hover:underline underline-offset-4"
                }`}
              >
                My Standings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Hero / Header Section if provided */}
      {(title || subtitle || action) && (
        <section className="bg-[var(--bg-surface)] border-b-2 border-[var(--border-default)] px-4 py-6 sm:px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                {title && <h1 className="text-2xl sm:text-3xl font-bold font-serif">{title}</h1>}
                {badge}
              </div>
              {subtitle && <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>}
            </div>
            {action && <div className="flex items-center gap-2">{action}</div>}
          </div>
        </section>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:px-6">{children}</main>

      {/* Shared UI Contract Footer: exactly 3 links */}
      <footer className="border-t-2 border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-secondary)] text-xs px-4 py-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BuiltOnBotChain />
          </div>
          <div className="flex items-center gap-6">
            <a
              href={site}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              botchain.ai
            </a>
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              BOT Chain Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PageShell;

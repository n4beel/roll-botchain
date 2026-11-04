"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract } from "@/lib/useChainWrite";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { ROLL_ABI } from "@/lib/botchain/abi";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { activeBotChain } from "@/lib/botchain/chain";
import { humanizeRollError } from "@/lib/errors";

export default function OpenClubPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();
  const chainId = activeBotChain.id;
  const deployed = isDeployed(chainId);
  const contractAddress = deployed ? getDeployment(chainId).address : undefined;

  const [name, setName] = useState("");
  const [dues, setDues] = useState("0.05");
  const [periodDays, setPeriodDays] = useState("7");
  const [leadDays, setLeadDays] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !contractAddress) return;

    setError(null);
    setSubmitting(true);

    try {
      if (name.trim().length === 0 || name.length > 48) {
        throw new Error("Club name must be between 1 and 48 characters.");
      }

      const duesWei = parseEther(dues);
      if (duesWei < parseEther("0.001") || duesWei > parseEther("100000")) {
        throw new Error("Dues must be between 0.001 BOT and 100,000 BOT.");
      }

      const pDays = parseFloat(periodDays);
      if (isNaN(pDays) || pDays < 1 || pDays > 366) {
        throw new Error("Period length must be between 1 and 366 days.");
      }
      const periodSecs = Math.round(pDays * 86400);

      const lDays = parseFloat(leadDays);
      if (isNaN(lDays) || lDays < 0 || lDays > 90) {
        throw new Error("Start lead time must be between 0 and 90 days.");
      }

      const block = await publicClient.getBlock();
      const startsAt = block.timestamp + BigInt(Math.round(lDays * 86400));

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: ROLL_ABI,
        functionName: "open",
        args: [name.trim(), duesWei, periodSecs, startsAt],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      // Find event or fetch latest club id
      const totalClubs = (await publicClient.readContract({
        address: contractAddress,
        abi: ROLL_ABI,
        functionName: "clubCount",
      })) as bigint;

      router.push(`/club/${totalClubs.toString()}`);
    } catch (err: any) {
      console.error(err);
      setError(humanizeRollError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      title="Open a Club Roll"
      subtitle="Configure dues amount, billing period, and launch your transparent dues roll."
      activeTab="open"
    >
      <div className="max-w-xl mx-auto">
        <Panel heading="Club Configuration">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-[#FDF0ED] border-2 border-[var(--danger)] text-[var(--danger)] text-xs font-medium">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Club Name (Max 48 chars)
              </label>
              <input
                id="name"
                type="text"
                maxLength={48}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Berkeley Runners Club"
                required
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] text-sm focus:border-[var(--border-strong)] outline-none"
              />
            </div>

            <div>
              <label htmlFor="dues" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Dues per Period (BOT)
              </label>
              <input
                id="dues"
                type="number"
                step="any"
                min="0.001"
                max="100000"
                value={dues}
                onChange={(e) => setDues(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] text-sm font-mono focus:border-[var(--border-strong)] outline-none"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Min: 0.001 BOT &middot; Max: 100,000 BOT
              </p>
            </div>

            <div>
              <label htmlFor="periodDays" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Period Duration (Days)
              </label>
              <input
                id="periodDays"
                type="number"
                step="any"
                min="1"
                max="366"
                value={periodDays}
                onChange={(e) => setPeriodDays(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] text-sm focus:border-[var(--border-strong)] outline-none"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Common periods: 7 (weekly), 30 (monthly), 365 (yearly). Range: 1 to 366 days.
              </p>
            </div>

            <div>
              <label htmlFor="leadDays" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                Start Delay (Days from now)
              </label>
              <input
                id="leadDays"
                type="number"
                step="any"
                min="0"
                max="90"
                value={leadDays}
                onChange={(e) => setLeadDays(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border-2 border-[var(--border-default)] text-sm focus:border-[var(--border-strong)] outline-none"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                0 = starts immediately. Range: 0 to 90 days.
              </p>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                disabled={!isConnected || submitting}
                className="w-full"
              >
                {!isConnected ? "Connect Wallet to Open" : "Open Club Roll"}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}

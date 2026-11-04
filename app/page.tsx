"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { ROLL_ABI } from "@/lib/botchain/abi";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { activeBotChain } from "@/lib/botchain/chain";
import { ClubInfo, currentPeriod } from "@/lib/roll";

export default function HomePage() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const chainId = activeBotChain.id;
  const deployed = isDeployed(chainId);
  const contractAddress = deployed ? getDeployment(chainId).address : undefined;

  const [clubs, setClubs] = useState<ClubInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowSecs, setNowSecs] = useState<bigint>(BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => {
    let cancelled = false;

    async function loadClubs() {
      if (!publicClient || !contractAddress) {
        setLoading(false);
        return;
      }

      try {
        const block = await publicClient.getBlock();
        if (!cancelled) setNowSecs(block.timestamp);

        const totalClubs = (await publicClient.readContract({
          address: contractAddress,
          abi: ROLL_ABI,
          functionName: "clubCount",
        })) as bigint;

        if (totalClubs === 0n) {
          if (!cancelled) {
            setClubs([]);
            setLoading(false);
          }
          return;
        }

        const countToFetch = totalClubs > 50n ? 50n : totalClubs;
        const res = (await publicClient.readContract({
          address: contractAddress,
          abi: ROLL_ABI,
          functionName: "latest",
          args: [0n, countToFetch],
        })) as [readonly bigint[], readonly any[], bigint];

        const [ids, clubData] = res;
        const list: ClubInfo[] = [];

        for (let i = 0; i < ids.length; i++) {
          list.push({
            id: ids[i],
            treasurer: clubData[i].treasurer,
            startsAt: BigInt(clubData[i].startsAt),
            periodSecs: Number(clubData[i].periodSecs),
            memberCount: Number(clubData[i].memberCount),
            dues: BigInt(clubData[i].dues),
            name: clubData[i].name,
          });
        }

        if (!cancelled) {
          setClubs(list);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load clubs:", err);
        if (!cancelled) setLoading(false);
      }
    }

    loadClubs();
    const interval = setInterval(loadClubs, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chainId, contractAddress]);

  // Separate clubs into "Your clubs" (where you are treasurer) and "All rolls"
  const yourClubs = address
    ? clubs.filter((c) => c.treasurer.toLowerCase() === address.toLowerCase())
    : [];

  return (
    <PageShell
      title="Public Club Rolls"
      subtitle="Collect club dues transparently. See who's paid up, ahead, or in arrears."
      activeTab="rolls"
      action={
        <Link href="/open">
          <Button variant="primary" size="md">
            + Open a Club
          </Button>
        </Link>
      }
    >
      <div className="space-y-8">
        {/* Notice of limits from Spec §1 & §3.4 */}
        <section aria-labelledby="limits-heading" className="bg-[var(--bg-surface)] border-2 border-[var(--border-strong)] p-4 shadow-[3px_3px_0px_var(--text-primary)]">
          <h2 id="limits-heading" className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)] font-sans mb-2">
            What the roll shows
          </h2>
          <ul className="text-xs text-[var(--text-secondary)] space-y-1 list-disc list-inside">
            <li><strong>Payments, not membership rights.</strong> The club decides what being paid up means.</li>
            <li><strong>Dues are not refundable.</strong> Prepaid periods stay with the club.</li>
            <li><strong>The treasurer is one trusted address</strong> with custody of collected dues and authority to remove members.</li>
          </ul>
        </section>

        {/* If user is treasurer of some clubs */}
        {yourClubs.length > 0 && (
          <div>
            <h2 className="text-lg font-serif font-bold mb-3">Clubs You Manage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {yourClubs.map((club) => (
                <ClubTile key={club.id.toString()} club={club} now={nowSecs} isTreasurer />
              ))}
            </div>
          </div>
        )}

        {/* All Rolls Wall Mosaic */}
        <div>
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 className="text-lg font-serif font-bold">All Club Rolls</h2>
            <span className="text-xs text-[var(--text-muted)]">{clubs.length} registered</span>
          </div>

          {!contractAddress ? (
            <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-default)] p-8 text-center">
              <p className="font-serif text-lg">Contract not deployed on this network</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Please connect to BOT Chain or local testnet.</p>
            </div>
          ) : loading && clubs.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-default)] p-12 text-center text-sm">
              Loading club rolls...
            </div>
          ) : clubs.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-default)] p-12 text-center">
              <p className="font-serif text-lg">No club rolls opened yet</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">
                Be the first to open a club dues roll on BOT Chain.
              </p>
              <Link href="/open">
                <Button variant="primary">Open First Club</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {clubs.map((club) => (
                <ClubTile
                  key={club.id.toString()}
                  club={club}
                  now={nowSecs}
                  isTreasurer={address?.toLowerCase() === club.treasurer.toLowerCase()}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function ClubTile({ club, now, isTreasurer }: { club: ClubInfo; now: bigint; isTreasurer?: boolean }) {
  const curP = currentPeriod(club.startsAt, club.periodSecs, now);
  const started = now >= club.startsAt;
  const daysPerPeriod = (club.periodSecs / 86400).toFixed(club.periodSecs % 86400 === 0 ? 0 : 1);

  return (
    <Link
      href={`/club/${club.id.toString()}`}
      className="block group bg-[var(--bg-surface)] border-2 border-[var(--border-default)] p-4 transition-all hover:border-[var(--border-strong)] hover:shadow-[3px_3px_0px_var(--text-primary)] hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-serif font-bold text-base text-[var(--text-primary)] group-hover:underline line-clamp-1">
          {club.name}
        </h3>
        {isTreasurer && (
          <span className="text-[9px] uppercase font-bold tracking-wider px-1 bg-[var(--accent)] text-[var(--accent-ink)] border border-[var(--border-strong)]">
            Treasurer
          </span>
        )}
      </div>

      <div className="text-xs text-[var(--text-secondary)] space-y-1 mb-3">
        <div className="flex justify-between">
          <span>Dues:</span>
          <strong className="font-mono text-[var(--text-primary)]">{formatEther(club.dues)} BOT</strong>
        </div>
        <div className="flex justify-between">
          <span>Period:</span>
          <span>{daysPerPeriod} day(s)</span>
        </div>
        <div className="flex justify-between">
          <span>Members:</span>
          <span className="font-bold">{club.memberCount} / 500</span>
        </div>
      </div>

      {/* Mini pigeonhole mosaic indicator */}
      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
        <div>{started ? `Current Period: ${curP}` : "Starts in future"}</div>
        <span className="text-[var(--text-primary)] font-bold group-hover:translate-x-0.5 transition-transform">
          View Wall &rarr;
        </span>
      </div>
    </Link>
  );
}

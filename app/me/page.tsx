"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract } from "@/lib/useChainWrite";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { ROLL_ABI } from "@/lib/botchain/abi";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { activeBotChain } from "@/lib/botchain/chain";
import { ClubInfo, StandingInfo, currentPeriod, standingOf } from "@/lib/roll";
import { humanizeRollError } from "@/lib/errors";

interface UserClubRecord {
  club: ClubInfo;
  standing: StandingInfo;
  isTreasurer: boolean;
}

export default function MePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();
  const chainId = activeBotChain.id;
  const deployed = isDeployed(chainId);
  const contractAddress = deployed ? getDeployment(chainId).address : undefined;

  const [records, setRecords] = useState<UserClubRecord[]>([]);
  const [pendingBalance, setPendingBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUserData() {
      if (!publicClient || !contractAddress || !address) {
        setLoading(false);
        return;
      }

      try {
        const block = await publicClient.getBlock();

        // 1. Pending dues as treasurer
        const pBal = (await publicClient.readContract({
          address: contractAddress,
          abi: ROLL_ABI,
          functionName: "pending",
          args: [address],
        })) as bigint;

        // 2. Fetch all clubs and check user standing or treasurer role
        const totalClubs = (await publicClient.readContract({
          address: contractAddress,
          abi: ROLL_ABI,
          functionName: "clubCount",
        })) as bigint;

        const found: UserClubRecord[] = [];

        // Check recent clubs
        const count = totalClubs > 50n ? 50n : totalClubs;
        if (count > 0n) {
          const [ids, cData] = (await publicClient.readContract({
            address: contractAddress,
            abi: ROLL_ABI,
            functionName: "latest",
            args: [0n, count],
          })) as [readonly bigint[], readonly any[], bigint];

          for (let i = 0; i < ids.length; i++) {
            const cId = ids[i];
            const club: ClubInfo = {
              id: cId,
              treasurer: cData[i].treasurer,
              startsAt: BigInt(cData[i].startsAt),
              periodSecs: Number(cData[i].periodSecs),
              memberCount: Number(cData[i].memberCount),
              dues: BigInt(cData[i].dues),
              name: cData[i].name,
            };

            const isTreasurer = club.treasurer.toLowerCase() === address.toLowerCase();

            const st = (await publicClient.readContract({
              address: contractAddress,
              abi: ROLL_ABI,
              functionName: "standing",
              args: [cId, address],
            })) as [number, number, bigint, boolean];

            const curP = currentPeriod(club.startsAt, club.periodSecs, block.timestamp);
            // If user has paidThrough > 0 or isTreasurer or removed
            const hasHistory = st[0] > 0 || st[3] || isTreasurer;

            if (hasHistory) {
              const standing = standingOf(st[0], curP, st[0] > 0, st[3]);
              found.push({ club, standing, isTreasurer });
            }
          }
        }

        if (!cancelled) {
          setPendingBalance(pBal);
          setRecords(found);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load user standing records:", err);
        if (!cancelled) setLoading(false);
      }
    }

    loadUserData();
    const interval = setInterval(loadUserData, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chainId, contractAddress, address]);

  async function handleWithdraw() {
    if (!publicClient || !contractAddress) return;

    setError(null);
    setWithdrawing(true);

    try {
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: ROLL_ABI,
        functionName: "withdraw",
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setPendingBalance(0n);
    } catch (err: any) {
      console.error(err);
      setError(humanizeRollError(err));
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <PageShell
      title="My Club Standings"
      subtitle="Overview of your memberships, dues standing across rolls, and accumulated treasurer earnings."
      activeTab="me"
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-[#FDF0ED] border-2 border-[var(--danger)] text-[var(--danger)] text-xs font-medium">
            {error}
          </div>
        )}

        {!isConnected ? (
          <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-default)] p-12 text-center">
            <p className="font-serif text-lg">Wallet not connected</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Connect your wallet to see your memberships, dues standing, and treasurer balance.
            </p>
          </div>
        ) : (
          <>
            {/* Treasurer Earnings / Withdrawal Box */}
            <Panel heading="Treasurer Balance">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-[var(--text-muted)]">Available to withdraw:</div>
                  <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                    {formatEther(pendingBalance)} BOT
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  loading={withdrawing}
                  disabled={pendingBalance === 0n || withdrawing}
                  onClick={handleWithdraw}
                >
                  Withdraw Funds
                </Button>
              </div>
            </Panel>

            {/* Club Standings Table / Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-serif font-bold">Your Clubs ({records.length})</h2>
              </div>

              {loading ? (
                <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-default)] p-8 text-center text-sm">
                  Scanning club rolls...
                </div>
              ) : records.length === 0 ? (
                <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-default)] p-8 text-center">
                  <p className="font-serif text-base">No active club memberships</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">
                    You have not paid dues to any clubs yet.
                  </p>
                  <Link href="/">
                    <Button variant="secondary" size="sm">
                      Browse Rolls
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {records.map(({ club, standing, isTreasurer }) => (
                    <div
                      key={club.id.toString()}
                      className="bg-[var(--bg-surface)] border-2 border-[var(--border-default)] p-4 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-serif font-bold text-base line-clamp-1">{club.name}</h3>
                          {isTreasurer && (
                            <span className="text-[9px] uppercase font-bold tracking-wider px-1 bg-[var(--accent)] text-[var(--accent-ink)]">
                              Treasurer
                            </span>
                          )}
                        </div>

                        <div className="my-3 p-2 border border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex items-center justify-between text-xs">
                          <span>Your Standing:</span>
                          <span className="font-bold">{standing.statusText}</span>
                        </div>

                        <div className="text-xs text-[var(--text-secondary)] space-y-1">
                          <div className="flex justify-between">
                            <span>Paid Through:</span>
                            <span className="font-bold">Period {standing.paidThrough}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Dues:</span>
                            <span className="font-mono">{formatEther(club.dues)} BOT</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-[var(--border-subtle)]">
                        <Link href={`/club/${club.id.toString()}`} className="block">
                          <Button variant="secondary" size="sm" className="w-full">
                            View Wall &amp; Pay &rarr;
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

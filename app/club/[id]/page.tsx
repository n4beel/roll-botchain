"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatEther, isAddress, type Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import Wall, { MemberData } from "@/components/pigeonholes/Wall";
import { ROLL_ABI } from "@/lib/botchain/abi";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { isBotChainId } from "@/lib/botchain/chain";
import {
  ClubInfo,
  StandingInfo,
  currentPeriod,
  standingOf,
  maxPayable,
  periodEnd,
} from "@/lib/roll";
import { humanizeRollError } from "@/lib/errors";

export default function ClubDetailPage() {
  const params = useParams();
  const rawId = params.id as string;
  const clubId = BigInt(rawId || "0");

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = publicClient?.chain?.id;
  const deployed = chainId && isBotChainId(chainId) && isDeployed(chainId);
  const contractAddress = deployed ? getDeployment(chainId).address : undefined;

  const [club, setClub] = useState<ClubInfo | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [userStanding, setUserStanding] = useState<StandingInfo | null>(null);
  const [treasurerPending, setTreasurerPending] = useState<bigint>(0n);
  const [nowSecs, setNowSecs] = useState<bigint>(BigInt(Math.floor(Date.now() / 1000)));
  const [loading, setLoading] = useState(true);

  // Pay Form state
  const [periodsToPay, setPeriodsToPay] = useState<number>(1);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Treasurer Tools state
  const [newTreasurer, setNewTreasurer] = useState("");
  const [handingOver, setHandingOver] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [removingAddr, setRemovingAddr] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!publicClient || !contractAddress || clubId <= 0n) {
        setLoading(false);
        return;
      }

      try {
        const block = await publicClient.getBlock();
        if (!cancelled) setNowSecs(block.timestamp);

        // 1. Load Club info
        const cData = (await publicClient.readContract({
          address: contractAddress,
          abi: ROLL_ABI,
          functionName: "clubOf",
          args: [clubId],
        })) as any;

        const clubObj: ClubInfo = {
          id: clubId,
          treasurer: cData.treasurer,
          startsAt: BigInt(cData.startsAt),
          periodSecs: Number(cData.periodSecs),
          memberCount: Number(cData.memberCount),
          dues: BigInt(cData.dues),
          name: cData.name,
        };

        // 2. Load members & standings
        const total = BigInt(cData.memberCount);
        const memberList: MemberData[] = [];

        if (total > 0n) {
          const fetchCount = total > 50n ? 50n : total;
          const [addrs] = (await publicClient.readContract({
            address: contractAddress,
            abi: ROLL_ABI,
            functionName: "membersOf",
            args: [clubId, 0n, fetchCount],
          })) as [readonly Address[], bigint];

          for (const addr of addrs) {
            const st = (await publicClient.readContract({
              address: contractAddress,
              abi: ROLL_ABI,
              functionName: "standing",
              args: [clubId, addr],
            })) as [number, number, bigint, boolean];

            const curP = currentPeriod(clubObj.startsAt, clubObj.periodSecs, block.timestamp);
            const standing = standingOf(st[0], curP, true, st[3]);
            memberList.push({ address: addr, standing });
          }
        }

        // 3. User standing if connected
        let uStanding: StandingInfo | null = null;
        if (address) {
          const st = (await publicClient.readContract({
            address: contractAddress,
            abi: ROLL_ABI,
            functionName: "standing",
            args: [clubId, address],
          })) as [number, number, bigint, boolean];

          const curP = currentPeriod(clubObj.startsAt, clubObj.periodSecs, block.timestamp);
          const isMember = memberList.some((m) => m.address.toLowerCase() === address.toLowerCase());
          uStanding = standingOf(st[0], curP, isMember, st[3]);
        }

        // 4. Treasurer pending balance if user is treasurer
        let pending = 0n;
        if (address && address.toLowerCase() === clubObj.treasurer.toLowerCase()) {
          pending = (await publicClient.readContract({
            address: contractAddress,
            abi: ROLL_ABI,
            functionName: "pending",
            args: [address],
          })) as bigint;
        }

        if (!cancelled) {
          setClub(clubObj);
          setMembers(memberList);
          setUserStanding(uStanding);
          setTreasurerPending(pending);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load club details:", err);
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    const interval = setInterval(loadData, 6000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chainId, contractAddress, clubId, address]);

  // Payment Handler
  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!walletClient || !publicClient || !contractAddress || !club) return;

    setPayError(null);
    setPaying(true);

    try {
      const value = club.dues * BigInt(periodsToPay);
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: ROLL_ABI,
        functionName: "pay",
        args: [clubId, periodsToPay],
        value,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      // Optimistic refresh
      setPeriodsToPay(1);
    } catch (err: any) {
      console.error(err);
      setPayError(humanizeRollError(err));
    } finally {
      setPaying(false);
    }
  }

  // Treasurer Hand Over Handler
  async function handleHandOver(e: React.FormEvent) {
    e.preventDefault();
    if (!walletClient || !publicClient || !contractAddress || !club) return;
    if (!isAddress(newTreasurer)) {
      setActionError("Please enter a valid Ethereum address.");
      return;
    }

    setActionError(null);
    setHandingOver(true);

    try {
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: ROLL_ABI,
        functionName: "handOver",
        args: [clubId, newTreasurer as Address],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setNewTreasurer("");
    } catch (err: any) {
      console.error(err);
      setActionError(humanizeRollError(err));
    } finally {
      setHandingOver(false);
    }
  }

  // Treasurer Withdraw Handler
  async function handleWithdraw() {
    if (!walletClient || !publicClient || !contractAddress) return;

    setActionError(null);
    setWithdrawing(true);

    try {
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: ROLL_ABI,
        functionName: "withdraw",
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTreasurerPending(0n);
    } catch (err: any) {
      console.error(err);
      setActionError(humanizeRollError(err));
    } finally {
      setWithdrawing(false);
    }
  }

  // Treasurer Remove Handler
  async function handleRemove(memberAddr: string) {
    if (!walletClient || !publicClient || !contractAddress || !club) return;

    setActionError(null);
    setRemovingAddr(memberAddr);

    try {
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: ROLL_ABI,
        functionName: "remove",
        args: [clubId, memberAddr as Address],
      });

      await publicClient.waitForTransactionReceipt({ hash });
    } catch (err: any) {
      console.error(err);
      setActionError(humanizeRollError(err));
    } finally {
      setRemovingAddr(null);
    }
  }

  if (loading) {
    return (
      <PageShell title="Loading Roll..." activeTab="rolls">
        <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-default)] p-12 text-center text-sm">
          Loading club roll details and standings...
        </div>
      </PageShell>
    );
  }

  if (!club) {
    return (
      <PageShell title="Club Not Found" activeTab="rolls">
        <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-default)] p-8 text-center space-y-4">
          <p className="font-serif text-lg">No club exists with ID #{clubId.toString()}</p>
          <Link href="/">
            <Button variant="secondary">Back to Rolls</Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  const isTreasurer = address?.toLowerCase() === club.treasurer.toLowerCase();
  const curP = currentPeriod(club.startsAt, club.periodSecs, nowSecs);
  const started = nowSecs >= club.startsAt;
  const isMember = members.some((m) => m.address.toLowerCase() === address?.toLowerCase());
  const maxP = userStanding ? maxPayable(userStanding.paidThrough, curP, isMember) : 3;

  // Pay line preview calculation (§3.4)
  const currentBase = userStanding && isMember ? userStanding.paidThrough : curP;
  const previewNewThrough = currentBase + periodsToPay;
  const previewEndDate = new Date(Number(periodEnd(club.startsAt, club.periodSecs, previewNewThrough)) * 1000).toLocaleDateString();
  const previewCost = formatEther(club.dues * BigInt(periodsToPay));

  return (
    <PageShell
      title={club.name}
      subtitle={`Treasurer: ${club.treasurer.slice(0, 8)}…${club.treasurer.slice(-6)} · Dues: ${formatEther(club.dues)} BOT / ${Math.round(club.periodSecs / 86400)} day(s)`}
      activeTab="rolls"
      badge={
        isTreasurer ? (
          <span className="text-xs uppercase font-bold px-2 py-0.5 bg-[var(--accent)] text-[var(--accent-ink)] border border-[var(--border-strong)]">
            Treasurer Mode
          </span>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {actionError && (
          <div className="p-3 bg-[#FDF0ED] border-2 border-[var(--danger)] text-[var(--danger)] text-xs font-medium">
            {actionError}
          </div>
        )}

        {/* Top Split: Payment Card & User Status / Treasurer summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pay Form Card */}
          <div className="md:col-span-1">
            <Panel heading="Pay Dues">
              {userStanding?.removed ? (
                <div className="p-3 bg-[#F1F3F0] border border-[#6A7661] text-[#6A7661] text-xs">
                  <strong>You were removed from this roll.</strong> You can no longer pay dues.
                </div>
              ) : maxP === 0 ? (
                <div className="p-3 bg-[#FFF8E6] border border-[#8A5A00] text-[#8A5A00] text-xs">
                  <strong>Paid maximum ahead!</strong> You are already paid through the maximum allowed 3 periods ahead.
                </div>
              ) : (
                <form onSubmit={handlePay} className="space-y-4">
                  {payError && (
                    <div className="p-2 bg-[#FDF0ED] border border-[var(--danger)] text-[var(--danger)] text-xs">
                      {payError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="periods" className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                      Number of Periods (Max {maxP})
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPeriodsToPay((p) => Math.max(1, p - 1))}
                        disabled={periodsToPay <= 1 || paying}
                        className="w-10 h-10 border-2 border-[var(--border-strong)] bg-[var(--bg-surface)] font-bold text-lg hover:bg-[var(--bg-elevated)] cursor-pointer disabled:opacity-50"
                      >
                        -
                      </button>
                      <input
                        id="periods"
                        type="number"
                        min="1"
                        max={maxP}
                        value={periodsToPay}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setPeriodsToPay(Math.max(1, Math.min(maxP, val)));
                        }}
                        className="w-16 h-10 text-center font-bold text-base border-2 border-[var(--border-default)]"
                      />
                      <button
                        type="button"
                        onClick={() => setPeriodsToPay((p) => Math.min(maxP, p + 1))}
                        disabled={periodsToPay >= maxP || paying}
                        className="w-10 h-10 border-2 border-[var(--border-strong)] bg-[var(--bg-surface)] font-bold text-lg hover:bg-[var(--bg-elevated)] cursor-pointer disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Spec §3.4: Pay line */}
                  <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]">
                    Pay <strong>{periodsToPay}</strong> period(s): <strong>{previewCost} BOT</strong>.
                    <br />
                    You will be paid through <strong>{previewEndDate}</strong>.
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={paying}
                    disabled={!isConnected || paying}
                    className="w-full"
                  >
                    {!isConnected ? "Connect Wallet to Pay" : "Pay Dues"}
                  </Button>
                </form>
              )}
            </Panel>
          </div>

          {/* User Status / Club Standing or Treasurer Box */}
          <div className="md:col-span-2 space-y-4">
            <Panel heading="Club Overview">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-[var(--text-muted)]">Current Period</div>
                  <div className="text-base font-bold font-serif">{started ? curP : "Not started"}</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Dues per Period</div>
                  <div className="text-base font-bold font-mono">{formatEther(club.dues)} BOT</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Total Members</div>
                  <div className="text-base font-bold">{club.memberCount} / 500</div>
                </div>
                <div>
                  <div className="text-[var(--text-muted)]">Your Standing</div>
                  <div className="text-base font-bold text-[var(--accent)]">
                    {userStanding ? userStanding.statusText : "Not connected"}
                  </div>
                </div>
              </div>
            </Panel>

            {/* Treasurer Management Panel */}
            {isTreasurer && (
              <Panel heading="Treasurer Controls">
                <div className="space-y-4 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                    <div>
                      <div className="font-bold text-sm">Accumulated Club Dues</div>
                      <div className="text-lg font-mono font-bold text-[var(--text-primary)] mt-0.5">
                        {formatEther(treasurerPending)} BOT
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={withdrawing}
                      disabled={treasurerPending === 0n || withdrawing}
                      onClick={handleWithdraw}
                    >
                      Withdraw to Wallet
                    </Button>
                  </div>

                  <form onSubmit={handleHandOver} className="pt-2 border-t border-[var(--border-subtle)]">
                    <label htmlFor="newTreas" className="block font-bold text-xs mb-1">
                      Hand Over Treasurer Role
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="newTreas"
                        type="text"
                        placeholder="0x... new treasurer address"
                        value={newTreasurer}
                        onChange={(e) => setNewTreasurer(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs font-mono border-2 border-[var(--border-default)]"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        loading={handingOver}
                        disabled={!newTreasurer || handingOver}
                      >
                        Hand Over
                      </Button>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      Already accumulated dues stay in your pending balance. Future dues will credit the new treasurer.
                    </p>
                  </form>
                </div>
              </Panel>
            )}
          </div>
        </div>

        {/* The Wall of Pigeonholes */}
        <section aria-labelledby="wall-heading">
          <Wall
            members={members}
            userAddress={address}
            treasurerAddress={club.treasurer}
            clubStartsAt={club.startsAt}
            periodSecs={club.periodSecs}
            onRemove={handleRemove}
            removingAddr={removingAddr}
          />
        </section>
      </div>
    </PageShell>
  );
}

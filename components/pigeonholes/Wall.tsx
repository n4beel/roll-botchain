import React from "react";
import { StandingInfo } from "@/lib/roll";
import Pigeonhole from "./Pigeonhole";

export interface MemberData {
  address: string;
  standing: StandingInfo;
}

export interface WallProps {
  members: MemberData[];
  userAddress?: string;
  treasurerAddress: string;
  clubStartsAt: bigint;
  periodSecs: number;
  onRemove?: (memberAddr: string) => void;
  removingAddr?: string | null;
}

export function Wall({
  members,
  userAddress,
  treasurerAddress,
  clubStartsAt,
  periodSecs,
  onRemove,
  removingAddr,
}: WallProps) {
  const isTreasurer = userAddress?.toLowerCase() === treasurerAddress.toLowerCase();

  // Summary counts
  const total = members.length;
  const currentCount = members.filter((m) => m.standing.statusTone === "current").length;
  const aheadCount = members.filter((m) => m.standing.statusTone === "ahead").length;
  const behindCount = members.filter((m) => m.standing.statusTone === "behind").length;
  const removedCount = members.filter((m) => m.standing.statusTone === "removed").length;

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="bg-[var(--bg-surface)] border-2 border-[var(--border-default)] p-3 flex flex-wrap items-center justify-between gap-4 text-xs font-medium">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-bold text-sm font-serif">Roll Members ({total})</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#1F7A3D] bg-[#E8F8ED] text-[#1F7A3D]">
            <span>✓ Paid Up:</span> <strong className="font-bold">{currentCount}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#8A5A00] bg-[#FFF8E6] text-[#8A5A00]">
            <span>▲ Ahead:</span> <strong className="font-bold">{aheadCount}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#B3261E] bg-[#FDF0ED] text-[#B3261E]">
            <span>▼ Arrears:</span> <strong className="font-bold">{behindCount}</strong>
          </span>
          {removedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#6A7661] bg-[#F1F3F0] text-[#6A7661]">
              <span>✕ Removed:</span> <strong className="font-bold">{removedCount}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Pigeonhole Grid */}
      {members.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border-2 border-dashed border-[var(--border-default)] p-12 text-center text-[var(--text-muted)]">
          <p className="font-serif text-lg text-[var(--text-primary)]">The roll is empty</p>
          <p className="text-sm mt-1">No members have joined or paid dues yet.</p>
        </div>
      ) : (
        <>
          <div className="pigeonhole-grid">
            {members.map((m) => (
              <Pigeonhole
                key={m.address}
                address={m.address}
                standing={m.standing}
                isSelf={userAddress?.toLowerCase() === m.address.toLowerCase()}
                isTreasurer={isTreasurer}
                clubStartsAt={clubStartsAt}
                periodSecs={periodSecs}
                canRemove={isTreasurer}
                removing={removingAddr?.toLowerCase() === m.address.toLowerCase()}
                onRemove={onRemove ? () => onRemove(m.address) : undefined}
              />
            ))}
          </div>

          {/* Accessible Table Equivalent for Screen Readers / tabular view */}
          <details className="mt-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 text-xs">
            <summary className="cursor-pointer font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              View accessible member table ({members.length})
            </summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="py-1 px-2 font-semibold">Address</th>
                    <th className="py-1 px-2 font-semibold">Standing</th>
                    <th className="py-1 px-2 font-semibold">Paid Through</th>
                    <th className="py-1 px-2 font-semibold">Offset</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.address} className="border-b border-[var(--border-subtle)]">
                      <td className="py-1 px-2 font-mono">{m.address}</td>
                      <td className="py-1 px-2">{m.standing.statusText}</td>
                      <td className="py-1 px-2">Period {m.standing.paidThrough}</td>
                      <td className="py-1 px-2">{m.standing.offset.toString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

export default Wall;

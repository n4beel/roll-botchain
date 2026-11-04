import React from "react";
import { formatEther } from "viem";
import { StandingInfo, periodRange } from "@/lib/roll";

export interface PigeonholeProps {
  address: string;
  standing: StandingInfo;
  isSelf?: boolean;
  isTreasurer?: boolean;
  clubStartsAt: bigint;
  periodSecs: number;
  onRemove?: () => void;
  canRemove?: boolean;
  removing?: boolean;
}

export function Pigeonhole({
  address,
  standing,
  isSelf = false,
  isTreasurer = false,
  clubStartsAt,
  periodSecs,
  onRemove,
  canRemove = false,
  removing = false,
}: PigeonholeProps) {
  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;

  // Tone styling
  const toneBg = {
    current: "bg-[#E8F8ED] border-[#1F7A3D] text-[#1F7A3D]",
    ahead: "bg-[#FFF8E6] border-[#8A5A00] text-[#8A5A00]",
    behind: "bg-[#FDF0ED] border-[#B3261E] text-[#B3261E]",
    removed: "bg-[#F1F3F0] border-[#6A7661] text-[#6A7661] opacity-70",
    not_joined: "bg-[#FFFFFF] border-[var(--border-default)] text-[var(--text-muted)]",
  }[standing.statusTone];

  const flagIcon = {
    current: "✓",
    ahead: "▲",
    behind: "▼",
    removed: "✕",
    not_joined: "○",
  }[standing.statusTone];

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`Member ${shortAddr}, status ${standing.statusText}`}
      className={`pigeonhole-slot ${
        isSelf ? "ring-2 ring-[var(--accent)] shadow-[2px_2px_0px_var(--text-primary)]" : ""
      }`}
    >
      {/* Top row: badge/flag */}
      <div className="flex items-center justify-between gap-1 w-full">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${toneBg}`}
        >
          <span aria-hidden="true">{flagIcon}</span>
          <span>{standing.statusText}</span>
        </span>
        {isSelf && (
          <span className="text-[9px] uppercase font-bold tracking-wider px-1 bg-[var(--text-primary)] text-white">
            YOU
          </span>
        )}
      </div>

      {/* Middle row: Address name tag */}
      <div className="my-2">
        <div className="font-mono text-xs font-bold text-[var(--text-primary)] break-all" title={address}>
          {shortAddr}
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
          Period {standing.paidThrough}
        </div>
      </div>

      {/* Bottom row: status details & remove button if treasurer */}
      <div className="w-full flex items-center justify-between gap-1 pt-1 border-t border-[var(--border-subtle)] text-[10px]">
        <div className="text-[var(--text-muted)] truncate">
          {standing.paidThrough === 0 ? "No dues paid" : `Thru P${standing.paidThrough - 1}`}
        </div>
        {canRemove && !standing.removed && onRemove && (
          <button
            onClick={onRemove}
            disabled={removing}
            className="text-[10px] text-[var(--danger)] hover:underline font-bold"
            title="Remove member"
          >
            {removing ? "…" : "Remove"}
          </button>
        )}
      </div>
    </div>
  );
}

export default Pigeonhole;

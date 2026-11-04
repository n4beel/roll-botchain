export function humanizeRollError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("BadParams")) {
    return "Invalid parameters. Please check the name length, dues amount, and period duration.";
  }
  if (msg.includes("BadStart")) {
    return "Start date must be between now and 90 days in the future.";
  }
  if (msg.includes("BadPeriods")) {
    return "You must pay between 1 and 3 periods at a time.";
  }
  if (msg.includes("ClubNotFound")) {
    return "Club does not exist.";
  }
  if (msg.includes("RemovedMember") || msg.includes("Removed")) {
    return "The treasurer removed you from this roll.";
  }
  if (msg.includes("WrongPayment")) {
    const match = msg.match(/expected: (\d+)/i) || msg.match(/0x/i);
    return "Payment amount does not match dues required.";
  }
  if (msg.includes("TooFarAhead")) {
    const match = msg.match(/maxPeriods: (\d+)/i);
    const m = match ? match[1] : "allowed";
    return `You can pay at most ${m} more period(s) ahead.`;
  }
  if (msg.includes("RollFull")) {
    return "This club has reached its maximum capacity of 500 members.";
  }
  if (msg.includes("NotTreasurer")) {
    return "Only the treasurer can perform this action.";
  }
  if (msg.includes("NotAMember")) {
    return "This address has not joined the club roll.";
  }
  if (msg.includes("BadTreasurer")) {
    return "Invalid treasurer address. Must be a new non-zero address.";
  }
  if (msg.includes("NothingToWithdraw")) {
    return "No pending funds available to withdraw.";
  }
  if (msg.includes("TransferFailed")) {
    return "BOT transfer failed during withdrawal.";
  }
  if (msg.includes("User rejected") || msg.includes("denied transaction signature")) {
    return "Transaction was cancelled in your wallet.";
  }

  return msg.slice(0, 160);
}

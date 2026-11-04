import { parseAbiItem, type Log } from "viem";

export const OPENED_EVENT = parseAbiItem(
  "event Opened(uint256 indexed id, address indexed treasurer, string name, uint128 dues, uint32 periodSecs, uint64 startsAt)"
);

export const PAID_EVENT = parseAbiItem(
  "event Paid(uint256 indexed id, address indexed who, uint8 periods, uint256 amount, uint32 paidThrough)"
);

export const REMOVED_EVENT = parseAbiItem(
  "event Removed(uint256 indexed id, address indexed who)"
);

export const HANDED_OVER_EVENT = parseAbiItem(
  "event HandedOver(uint256 indexed id, address indexed from, address indexed to)"
);

export const WITHDRAWN_EVENT = parseAbiItem(
  "event Withdrawn(address indexed to, uint256 amount)"
);

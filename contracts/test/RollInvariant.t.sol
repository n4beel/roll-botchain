// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Roll} from "../src/Roll.sol";

contract RollHandler is Test {
  Roll public roll;
  address[] public treasurers;
  address[] public members;
  uint256 public sumPending;

  constructor(Roll _roll) {
    roll = _roll;
    treasurers.push(address(0x1111));
    treasurers.push(address(0x2222));

    members.push(address(0x3333));
    members.push(address(0x4444));
    members.push(address(0x5555));

    for (uint256 i = 0; i < treasurers.length; i++) {
      vm.deal(treasurers[i], 1_000 ether);
    }
    for (uint256 i = 0; i < members.length; i++) {
      vm.deal(members[i], 1_000 ether);
    }

    // Create an initial club
    vm.prank(treasurers[0]);
    roll.open("Handler Club", 0.01 ether, 1 days, uint64(block.timestamp));
  }

  function open(uint8 tIdx, uint128 dues, uint32 period) external {
    address t = treasurers[tIdx % treasurers.length];
    dues = uint128(bound(dues, roll.MIN_DUES(), 10 ether));
    period = uint32(bound(period, roll.MIN_PERIOD(), 30 days));

    vm.prank(t);
    try roll.open("Club", dues, period, uint64(block.timestamp)) returns (uint256) {} catch {}
  }

  function pay(uint8 mIdx, uint256 clubId, uint8 periods) external {
    uint256 count = roll.clubCount();
    if (count == 0) return;
    clubId = (clubId % count) + 1;
    address m = members[mIdx % members.length];
    periods = uint8(bound(periods, 1, 3));

    Roll.Club memory c = roll.clubOf(clubId);
    uint256 val = uint256(c.dues) * periods;

    vm.prank(m);
    try roll.pay{value: val}(clubId, periods) {
      sumPending += val;
    } catch {}
  }

  function withdraw(uint8 tIdx) external {
    address t = treasurers[tIdx % treasurers.length];
    uint256 p = roll.pending(t);
    if (p > 0) {
      vm.prank(t);
      try roll.withdraw() {
        sumPending -= p;
      } catch {}
    }
  }

  function warp(uint32 secs) external {
    secs = uint32(bound(secs, 1 hours, 10 days));
    vm.warp(block.timestamp + secs);
  }
}

contract RollInvariantTest is Test {
  Roll public roll;
  RollHandler public handler;

  function setUp() public {
    roll = new Roll();
    handler = new RollHandler(roll);
    targetContract(address(handler));
  }

  function invariant_BalanceEqualsPending() public view {
    assertEq(address(roll).balance, handler.sumPending());
  }
}

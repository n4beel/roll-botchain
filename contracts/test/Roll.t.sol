// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test, console2} from "forge-std/Test.sol";
import {Roll} from "../src/Roll.sol";

contract MaliciousReceiver {
  Roll public roll;
  constructor(Roll _roll) {
    roll = _roll;
  }
  function attack() external {
    roll.withdraw();
  }
  receive() external payable {
    // Try reentrancy
    roll.withdraw();
  }
}

contract RollTest is Test {
  Roll public roll;
  address public treasurer = address(0x1111);
  address public alice = address(0x2222);
  address public bob = address(0x3333);
  address public charlie = address(0x4444);

  uint128 public constant DUES = 0.05 ether;
  uint32 public constant PERIOD_SECS = 7 days;

  function setUp() public {
    roll = new Roll();
    vm.deal(treasurer, 100 ether);
    vm.deal(alice, 100 ether);
    vm.deal(bob, 100 ether);
    vm.deal(charlie, 100 ether);
  }

  function test_OpenAndFirstPaymentStartsAtCurrentPeriod() public {
    uint64 startsAt = uint64(block.timestamp + 1 days);
    vm.prank(treasurer);
    uint256 id = roll.open("Running Club", DUES, PERIOD_SECS, startsAt);

    assertEq(id, 1);
    Roll.Club memory c = roll.clubOf(id);
    assertEq(c.treasurer, treasurer);
    assertEq(c.startsAt, startsAt);
    assertEq(c.periodSecs, PERIOD_SECS);
    assertEq(c.dues, DUES);
    assertEq(c.name, "Running Club");
    assertEq(c.memberCount, 0);

    // Warp to startsAt + 2 periods
    vm.warp(startsAt + 2 * PERIOD_SECS + 100);
    assertEq(roll.currentPeriodOf(id), 2);

    // Alice joins and pays 1 period
    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    // Base was currentPeriod = 2, so new paidThrough is 2 + 1 = 3
    (uint32 paidThrough, uint32 curPeriod, int64 offset, bool removed) = roll.standing(id, alice);
    assertEq(paidThrough, 3);
    assertEq(curPeriod, 2);
    // offset = 3 - 2 - 1 = 0 (paid through current period)
    assertEq(offset, 0);
    assertFalse(removed);

    (address[] memory members, uint256 total) = roll.membersOf(id, 0, 10);
    assertEq(total, 1);
    assertEq(members.length, 1);
    assertEq(members[0], alice);
  }

  function test_PayCreditsTreasurer() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Book Club", DUES, PERIOD_SECS, startsAt);

    vm.prank(alice);
    roll.pay{value: DUES * 2}(id, 2);

    assertEq(roll.pending(treasurer), DUES * 2);
    assertEq(address(roll).balance, DUES * 2);

    uint256 balBefore = treasurer.balance;
    vm.prank(treasurer);
    roll.withdraw();

    assertEq(treasurer.balance, balBefore + DUES * 2);
    assertEq(roll.pending(treasurer), 0);
    assertEq(address(roll).balance, 0);
  }

  function test_WrongPaymentReverts_ArgsExpected() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Chess Club", DUES, PERIOD_SECS, startsAt);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Roll.WrongPayment.selector, DUES * 2));
    roll.pay{value: DUES}(id, 2);
  }

  function test_PayAheadUpToThree() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Swim Club", DUES, PERIOD_SECS, startsAt);

    // Cur period = 0. Pay 3 periods -> paidThrough = 3.
    // offset = 3 - 0 - 1 = 2 (2 periods ahead)
    vm.prank(alice);
    roll.pay{value: DUES * 3}(id, 3);

    (uint32 paidThrough, uint32 curPeriod, int64 offset, ) = roll.standing(id, alice);
    assertEq(paidThrough, 3);
    assertEq(curPeriod, 0);
    assertEq(offset, 2);
  }

  function test_PayTooFarAheadReverts_ArgsMax() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Rowing Club", DUES, PERIOD_SECS, startsAt);

    // First pay 2 periods ahead (paidThrough = 2, cur = 0)
    vm.prank(alice);
    roll.pay{value: DUES * 2}(id, 2);

    // Alice tries to pay 2 more periods.
    // base = 2, newThrough = 4. curPeriod = 0.
    // 4 - 0 = 4 > 3 -> TooFarAhead(1) because 3 - (2 - 0) = 1
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Roll.TooFarAhead.selector, 1));
    roll.pay{value: DUES * 2}(id, 2);

    // Alice can pay 1 more period
    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);
    (uint32 pt, , , ) = roll.standing(id, alice);
    assertEq(pt, 3);
  }

  function test_LapsedMemberPaysFromWhereTheyStopped() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Cycling Club", DUES, PERIOD_SECS, startsAt);

    // Alice joins in period 0, pays 1 period -> paidThrough = 1
    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    // 5 periods pass. Now curPeriod = 5.
    vm.warp(startsAt + 5 * PERIOD_SECS + 10);
    assertEq(roll.currentPeriodOf(id), 5);

    // Standing: paidThrough = 1, curPeriod = 5, offset = 1 - 5 - 1 = -5
    (, , int64 offset, ) = roll.standing(id, alice);
    assertEq(offset, -5);

    // Alice pays 2 periods. base is 1 (where she stopped!), so newThrough = 3
    vm.prank(alice);
    roll.pay{value: DUES * 2}(id, 2);

    (uint32 ptAfter, , int64 offsetAfter, ) = roll.standing(id, alice);
    assertEq(ptAfter, 3);
    // 3 - 5 - 1 = -3
    assertEq(offsetAfter, -3);
  }

  function test_StandingOffsets() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Test Club", DUES, PERIOD_SECS, startsAt);

    // Alice pays 1 period at period 0 -> paidThrough = 1. offset = 1 - 0 - 1 = 0 (current)
    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);
    (, , int64 offset0, ) = roll.standing(id, alice);
    assertEq(offset0, 0);

    // Bob pays 3 periods at period 0 -> paidThrough = 3. offset = 3 - 0 - 1 = 2 (2 ahead)
    vm.prank(bob);
    roll.pay{value: DUES * 3}(id, 3);
    (, , int64 offsetBob, ) = roll.standing(id, bob);
    assertEq(offsetBob, 2);

    // Charlie has not joined. offset = 0 - 0 - 1 = -1
    (, , int64 offsetCharlie, ) = roll.standing(id, charlie);
    assertEq(offsetCharlie, -1);

    // Advance 2 periods
    vm.warp(startsAt + 2 * PERIOD_SECS + 1);
    // Alice paidThrough = 1, curPeriod = 2. offset = 1 - 2 - 1 = -2 (arrears)
    (, , int64 offsetAlice2, ) = roll.standing(id, alice);
    assertEq(offsetAlice2, -2);
    // Bob paidThrough = 3, curPeriod = 2. offset = 3 - 2 - 1 = 0 (current)
    (, , int64 offsetBob2, ) = roll.standing(id, bob);
    assertEq(offsetBob2, 0);
  }

  function test_BeforeStartCountsAsPeriodZero() public {
    uint64 startsAt = uint64(block.timestamp + 5 days);
    vm.prank(treasurer);
    uint256 id = roll.open("Future Club", DUES, PERIOD_SECS, startsAt);

    assertEq(roll.currentPeriodOf(id), 0);

    // Alice can pay ahead before club starts
    vm.prank(alice);
    roll.pay{value: DUES * 2}(id, 2);

    (uint32 paidThrough, uint32 curPeriod, int64 offset, ) = roll.standing(id, alice);
    assertEq(curPeriod, 0);
    assertEq(paidThrough, 2);
    assertEq(offset, 1);
  }

  function test_RemoveBlocksPayment() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Club", DUES, PERIOD_SECS, startsAt);

    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    // Treasurer removes Alice
    vm.prank(treasurer);
    roll.remove(id, alice);

    (, , , bool removed) = roll.standing(id, alice);
    assertTrue(removed);

    // Alice tries to pay again
    vm.prank(alice);
    vm.expectRevert(Roll.RemovedMember.selector);
    roll.pay{value: DUES}(id, 1);
  }

  function test_RemoveByStrangerReverts() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Club", DUES, PERIOD_SECS, startsAt);

    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    vm.prank(bob);
    vm.expectRevert(Roll.NotTreasurer.selector);
    roll.remove(id, alice);
  }

  function test_HandOverMovesFutureCredits_NotPast() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Club", DUES, PERIOD_SECS, startsAt);

    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    assertEq(roll.pending(treasurer), DUES);

    // Hand over to bob
    vm.prank(treasurer);
    roll.handOver(id, bob);

    Roll.Club memory c = roll.clubOf(id);
    assertEq(c.treasurer, bob);

    // Alice pays another period
    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    // Old treasurer still has the old dues in pending
    assertEq(roll.pending(treasurer), DUES);
    // New treasurer gets the new payment
    assertEq(roll.pending(bob), DUES);

    // Bob can withdraw his, treasurer can withdraw his
    vm.prank(bob);
    roll.withdraw();
    assertEq(roll.pending(bob), 0);

    vm.prank(treasurer);
    roll.withdraw();
    assertEq(roll.pending(treasurer), 0);
  }

  function test_RollFullReverts() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Club", DUES, PERIOD_SECS, startsAt);

    // Add 500 members
    for (uint160 i = 1; i <= 500; i++) {
      address m = address(uint160(0x10000 + i));
      vm.deal(m, 1 ether);
      vm.prank(m);
      roll.pay{value: DUES}(id, 1);
    }

    // 501st member reverts with RollFull
    address m501 = address(0x99999);
    vm.deal(m501, 1 ether);
    vm.prank(m501);
    vm.expectRevert(Roll.RollFull.selector);
    roll.pay{value: DUES}(id, 1);
  }

  function test_BadParamsRevert() public {
    // empty name
    vm.expectRevert(Roll.BadParams.selector);
    roll.open("", DUES, PERIOD_SECS, uint64(block.timestamp));

    // dues too low
    vm.expectRevert(Roll.BadParams.selector);
    roll.open("A", 0.0001 ether, PERIOD_SECS, uint64(block.timestamp));

    // dues too high
    vm.expectRevert(Roll.BadParams.selector);
    roll.open("A", 100_001 ether, PERIOD_SECS, uint64(block.timestamp));

    // period too short
    vm.expectRevert(Roll.BadParams.selector);
    roll.open("A", DUES, 1 hours, uint64(block.timestamp));

    // period too long
    vm.expectRevert(Roll.BadParams.selector);
    roll.open("A", DUES, 400 days, uint64(block.timestamp));

    // startsAt in past
    vm.warp(100 days);
    vm.expectRevert(Roll.BadStart.selector);
    roll.open("A", DUES, PERIOD_SECS, uint64(block.timestamp - 1));

    // startsAt beyond max lead (90 days)
    vm.expectRevert(Roll.BadStart.selector);
    roll.open("A", DUES, PERIOD_SECS, uint64(block.timestamp + 91 days));
  }

  function test_MemberListNoDuplicates() public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Club", DUES, PERIOD_SECS, startsAt);

    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    (address[] memory members, uint256 total) = roll.membersOf(id, 0, 10);
    assertEq(total, 1);
    assertEq(members.length, 1);
    assertEq(members[0], alice);
  }

  function test_ReentrantWithdrawBlocked() public {
    uint64 startsAt = uint64(block.timestamp);
    MaliciousReceiver mal = new MaliciousReceiver(roll);

    vm.prank(address(mal));
    uint256 id = roll.open("Club", DUES, PERIOD_SECS, startsAt);

    vm.prank(alice);
    roll.pay{value: DUES}(id, 1);

    // mal is treasurer, has pending DUES
    assertEq(roll.pending(address(mal)), DUES);

    // Call withdraw from mal -> mal.receive() will re-enter withdraw() -> revert ReentrancyGuard, which causes .call to return false -> TransferFailed
    vm.expectRevert(Roll.TransferFailed.selector);
    mal.attack();
  }

  function test_BoundaryMutantKillers() public {
    // Tests specifically for mutation checking:
    // Name exactly 48 bytes
    string memory name48 = "123456789012345678901234567890123456789012345678";
    uint256 id = roll.open(name48, roll.MIN_DUES(), roll.MIN_PERIOD(), uint64(block.timestamp));
    assertEq(id, 1);

    // Name 49 bytes reverts
    string memory name49 = "1234567890123456789012345678901234567890123456789";
    uint128 minDues = roll.MIN_DUES();
    uint32 minPeriod = roll.MIN_PERIOD();
    vm.expectRevert(Roll.BadParams.selector);
    roll.open(name49, minDues, minPeriod, uint64(block.timestamp));

    // startsAt exactly now + MAX_LEAD
    roll.open("MaxLead", minDues, minPeriod, uint64(block.timestamp + roll.MAX_LEAD()));

    // MAX_DUES and MAX_PERIOD
    roll.open("MaxDues", roll.MAX_DUES(), roll.MAX_PERIOD(), uint64(block.timestamp));

    // Withdraw with 0 pending reverts
    vm.expectRevert(Roll.NothingToWithdraw.selector);
    roll.withdraw();

    // HandOver to self reverts
    vm.prank(treasurer);
    uint256 cid = roll.open("HandOver", DUES, PERIOD_SECS, uint64(block.timestamp));
    vm.prank(treasurer);
    vm.expectRevert(Roll.BadTreasurer.selector);
    roll.handOver(cid, treasurer);

    // HandOver to address(0) reverts
    vm.prank(treasurer);
    vm.expectRevert(Roll.BadTreasurer.selector);
    roll.handOver(cid, address(0));

    // Remove non-member reverts
    vm.prank(treasurer);
    vm.expectRevert(Roll.NotAMember.selector);
    roll.remove(cid, bob);

    // Latest pagination
    (uint256[] memory ids, , uint256 total) = roll.latest(0, 10);
    assertEq(total, roll.clubCount());
    assertTrue(ids.length > 0);
  }

  function testFuzz_PaidThroughMonotoneAndBounded(uint8[5] memory periods, uint32[5] memory warps) public {
    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Fuzz Club", DUES, PERIOD_SECS, startsAt);

    uint32 lastThrough = 0;
    for (uint256 i = 0; i < 5; i++) {
      uint8 p = uint8(bound(periods[i], 1, 3));
      uint32 w = uint32(bound(warps[i], 0, 30 days));
      vm.warp(block.timestamp + w);

      uint32 curP = roll.currentPeriodOf(id);
      (uint32 currentThrough, , , ) = roll.standing(id, alice);
      uint32 base = currentThrough == 0 ? curP : currentThrough;

      if (base + p > curP && (base + p - curP) > 3) {
        // Expected to revert TooFarAhead
        vm.prank(alice);
        vm.expectRevert();
        roll.pay{value: uint256(DUES) * p}(id, p);
      } else {
        vm.prank(alice);
        roll.pay{value: uint256(DUES) * p}(id, p);
        (uint32 newThrough, , , ) = roll.standing(id, alice);
        assertGe(newThrough, lastThrough);
        lastThrough = newThrough;
      }
    }
  }

  function testFuzz_Conservation(uint8 p1, uint8 p2, uint8 p3) public {
    p1 = uint8(bound(p1, 1, 3));
    p2 = uint8(bound(p2, 1, 3));
    p3 = uint8(bound(p3, 1, 3));

    uint64 startsAt = uint64(block.timestamp);
    vm.prank(treasurer);
    uint256 id = roll.open("Conservation Club", DUES, PERIOD_SECS, startsAt);

    vm.prank(alice);
    roll.pay{value: uint256(DUES) * p1}(id, p1);

    vm.prank(bob);
    roll.pay{value: uint256(DUES) * p2}(id, p2);

    vm.prank(charlie);
    roll.pay{value: uint256(DUES) * p3}(id, p3);

    uint256 totalExpected = uint256(DUES) * (p1 + p2 + p3);
    assertEq(address(roll).balance, totalExpected);
    assertEq(roll.pending(treasurer), totalExpected);
  }
}

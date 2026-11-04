// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Roll — A transparent public dues roll for clubs
/// @notice Collect club dues. See who is paid up.
contract Roll {
  // --- Constants ---
  uint256 public constant MAX_NAME_BYTES = 48;
  uint128 public constant MIN_DUES = 0.001 ether;
  uint128 public constant MAX_DUES = 100_000 ether;
  uint32 public constant MIN_PERIOD = 1 days;
  uint32 public constant MAX_PERIOD = 366 days;
  uint8 public constant MAX_AHEAD = 3;
  uint32 public constant MAX_MEMBERS = 500;
  uint64 public constant MAX_LEAD = 90 days;
  uint256 public constant MAX_PAGE = 50;

  // --- Structs ---
  struct Club {
    address treasurer;
    uint64 startsAt;
    uint32 periodSecs;
    uint32 memberCount;
    uint128 dues;
    string name;
  }

  struct Member {
    uint32 paidThrough;
    bool joined;
    bool removed;
  }

  // --- State ---
  mapping(uint256 => Club) private _clubs;
  mapping(uint256 => address[]) private _members;
  mapping(uint256 => mapping(address => Member)) private _roll;
  mapping(address => uint256) public pending;
  uint256 public clubCount;

  uint256 private _locked;

  // --- Events ---
  event Opened(
    uint256 indexed id,
    address indexed treasurer,
    string name,
    uint128 dues,
    uint32 periodSecs,
    uint64 startsAt
  );
  event Paid(
    uint256 indexed id,
    address indexed who,
    uint8 periods,
    uint256 amount,
    uint32 paidThrough
  );
  event Removed(uint256 indexed id, address indexed who);
  event HandedOver(uint256 indexed id, address indexed from, address indexed to);
  event Withdrawn(address indexed to, uint256 amount);

  // --- Custom Errors ---
  error BadParams();
  error BadStart();
  error BadPeriods();
  error ClubNotFound();
  error RemovedMember();
  error WrongPayment(uint256 expected);
  error TooFarAhead(uint8 maxPeriods);
  error RollFull();
  error NotTreasurer();
  error NotAMember();
  error BadTreasurer();
  error NothingToWithdraw();
  error TransferFailed();
  error ReentrancyGuard();

  // --- Modifiers ---
  modifier nonReentrant() {
    if (_locked == 1) revert ReentrancyGuard();
    _locked = 1;
    _;
    _locked = 0;
  }

  // --- Core Functions ---

  /// @notice Open a new club roll
  function open(
    string calldata name,
    uint128 dues,
    uint32 periodSecs,
    uint64 startsAt
  ) external returns (uint256 id) {
    if (bytes(name).length == 0 || bytes(name).length > MAX_NAME_BYTES) revert BadParams();
    if (dues < MIN_DUES || dues > MAX_DUES) revert BadParams();
    if (periodSecs < MIN_PERIOD || periodSecs > MAX_PERIOD) revert BadParams();
    if (startsAt < block.timestamp || startsAt > block.timestamp + MAX_LEAD) revert BadStart();

    id = ++clubCount;
    Club storage c = _clubs[id];
    c.treasurer = msg.sender;
    c.startsAt = startsAt;
    c.periodSecs = periodSecs;
    c.dues = dues;
    c.name = name;

    emit Opened(id, msg.sender, name, dues, periodSecs, startsAt);
  }

  /// @notice Pay dues for a club
  function pay(uint256 id, uint8 periods) external payable {
    if (id == 0 || id > clubCount) revert ClubNotFound();
    if (periods < 1 || periods > MAX_AHEAD) revert BadPeriods();

    Club storage c = _clubs[id];
    Member storage m = _roll[id][msg.sender];
    if (m.removed) revert RemovedMember();

    uint256 expected = uint256(c.dues) * periods;
    if (msg.value != expected) revert WrongPayment(expected);

    uint32 curPeriod = currentPeriodOf(id);
    uint32 base = m.joined ? m.paidThrough : curPeriod;
    uint32 newThrough = base + periods;

    // newThrough - currentPeriod <= MAX_AHEAD
    // If member was in arrears, newThrough might be <= curPeriod, which is fine
    if (newThrough > curPeriod && (newThrough - curPeriod) > MAX_AHEAD) {
      uint8 maxP = uint8(MAX_AHEAD - (base > curPeriod ? (base - curPeriod) : 0));
      revert TooFarAhead(maxP);
    }

    if (!m.joined) {
      if (c.memberCount >= MAX_MEMBERS) revert RollFull();
      m.joined = true;
      c.memberCount++;
      _members[id].push(msg.sender);
    }

    m.paidThrough = newThrough;
    pending[c.treasurer] += msg.value;

    emit Paid(id, msg.sender, periods, msg.value, newThrough);
  }

  /// @notice Remove a member from the roll
  function remove(uint256 id, address who) external {
    if (id == 0 || id > clubCount) revert ClubNotFound();
    Club storage c = _clubs[id];
    if (msg.sender != c.treasurer) revert NotTreasurer();

    Member storage m = _roll[id][who];
    if (!m.joined) revert NotAMember();

    m.removed = true;
    emit Removed(id, who);
  }

  /// @notice Hand over the treasurer role to another address
  function handOver(uint256 id, address to) external {
    if (id == 0 || id > clubCount) revert ClubNotFound();
    Club storage c = _clubs[id];
    if (msg.sender != c.treasurer) revert NotTreasurer();
    if (to == address(0) || to == msg.sender) revert BadTreasurer();

    address old = c.treasurer;
    c.treasurer = to;
    emit HandedOver(id, old, to);
  }

  /// @notice Withdraw accumulated pending dues
  function withdraw() external nonReentrant {
    uint256 amount = pending[msg.sender];
    if (amount == 0) revert NothingToWithdraw();

    pending[msg.sender] = 0;
    (bool ok, ) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed();

    emit Withdrawn(msg.sender, amount);
  }

  // --- Views ---

  /// @notice Calculate the current period index of a club
  function currentPeriodOf(uint256 id) public view returns (uint32) {
    Club storage c = _clubs[id];
    if (block.timestamp < c.startsAt) {
      return 0;
    }
    return uint32((block.timestamp - c.startsAt) / c.periodSecs);
  }

  /// @notice Retrieve club information
  function clubOf(uint256 id) external view returns (Club memory) {
    if (id == 0 || id > clubCount) revert ClubNotFound();
    return _clubs[id];
  }

  /// @notice Standing of a member: paidThrough, currentPeriod, offset, removed
  /// offset = paidThrough - currentPeriod - 1 (0: paid through current, negative: arrears, positive: ahead)
  function standing(uint256 id, address who)
    external
    view
    returns (
      uint32 paidThrough,
      uint32 currentPeriod,
      int64 offset,
      bool removed
    )
  {
    if (id == 0 || id > clubCount) revert ClubNotFound();
    currentPeriod = currentPeriodOf(id);
    Member storage m = _roll[id][who];
    paidThrough = m.paidThrough;
    removed = m.removed;

    if (!m.joined) {
      // Not joined: 0 paidThrough, offset is negative
      offset = int64(uint64(paidThrough)) - int64(uint64(currentPeriod)) - 1;
    } else {
      offset = int64(uint64(paidThrough)) - int64(uint64(currentPeriod)) - 1;
    }
  }

  /// @notice Page through members of a club
  function membersOf(
    uint256 id,
    uint256 offset,
    uint256 count
  ) external view returns (address[] memory addrs, uint256 total) {
    if (id == 0 || id > clubCount) revert ClubNotFound();
    address[] storage list = _members[id];
    total = list.length;

    if (count > MAX_PAGE) {
      count = MAX_PAGE;
    }

    if (offset >= total || count == 0) {
      return (new address[](0), total);
    }

    if (offset + count > total) {
      count = total - offset;
    }

    addrs = new address[](count);
    for (uint256 i = 0; i < count; i++) {
      addrs[i] = list[offset + i];
    }
  }

  /// @notice Return the most recent clubs
  function latest(uint256 offset, uint256 count)
    external
    view
    returns (uint256[] memory ids, Club[] memory clubs, uint256 total)
  {
    total = clubCount;
    if (count > MAX_PAGE) {
      count = MAX_PAGE;
    }

    if (offset >= total || count == 0) {
      return (new uint256[](0), new Club[](0), total);
    }

    if (offset + count > total) {
      count = total - offset;
    }

    ids = new uint256[](count);
    clubs = new Club[](count);

    for (uint256 i = 0; i < count; i++) {
      uint256 id = total - (offset + i);
      ids[i] = id;
      clubs[i] = _clubs[id];
    }
  }
}

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ROLL_ABI } from "../../lib/botchain/abi";
import { readFileSync } from "fs";
import { resolve } from "path";

const ANVIL_PORT = 8653;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;

// Anvil default accounts
const TREASURER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Account 0
const ALICE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";     // Account 1
const BOB_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";       // Account 2

const treasurerAccount = privateKeyToAccount(TREASURER_KEY);
const aliceAccount = privateKeyToAccount(ALICE_KEY);
const bobAccount = privateKeyToAccount(BOB_KEY);

describe("Roll integration test (Anvil)", () => {
  let anvilProcess: ChildProcess;
  let contractAddress: Address;

  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  });

  const treasurerClient = createWalletClient({
    account: treasurerAccount,
    transport: http(RPC_URL),
  });

  const aliceClient = createWalletClient({
    account: aliceAccount,
    transport: http(RPC_URL),
  });

  const bobClient = createWalletClient({
    account: bobAccount,
    transport: http(RPC_URL),
  });

  beforeAll(async () => {
    // Start anvil on port 8653
    anvilProcess = spawn("anvil", ["--port", String(ANVIL_PORT), "--silent"], {
      stdio: "ignore",
    });

    // Wait for anvil to be reachable
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        await publicClient.getBlockNumber();
        connected = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!connected) throw new Error("Could not connect to Anvil on port " + ANVIL_PORT);

    // Deploy contract
    const artifactPath = resolve(__dirname, "../../contracts/out/Roll.sol/Roll.json");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const bytecode = artifact.bytecode.object as `0x${string}`;

    const deployHash = await treasurerClient.deployContract({
      abi: ROLL_ABI,
      bytecode,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    if (!receipt.contractAddress) throw new Error("Contract deployment failed");
    contractAddress = receipt.contractAddress;
  }, 20000);

  afterAll(() => {
    if (anvilProcess) {
      anvilProcess.kill();
    }
  });

  it("completes full club lifecycle: open -> pay -> advance time -> behind -> pay arrears -> withdraw", async () => {
    const dues = parseEther("0.1");
    const periodSecs = 86400; // 1 day
    const block = await publicClient.getBlock();
    const startsAt = block.timestamp;

    // 1. Treasurer opens club
    const openHash = await treasurerClient.writeContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "open",
      args: ["Runners United", dues, periodSecs, startsAt],
    });
    await publicClient.waitForTransactionReceipt({ hash: openHash });

    const clubCount = await publicClient.readContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "clubCount",
    });
    expect(clubCount).toBe(1n);

    // 2. Alice joins and pays 1 period
    const alicePayHash = await aliceClient.writeContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "pay",
      args: [1n, 1],
      value: dues,
    });
    await publicClient.waitForTransactionReceipt({ hash: alicePayHash });

    // 3. Bob joins and pays 3 periods (maximum ahead)
    const bobPayHash = await bobClient.writeContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "pay",
      args: [1n, 3],
      value: dues * 3n,
    });
    await publicClient.waitForTransactionReceipt({ hash: bobPayHash });

    // Check standings at period 0
    const standingAlice0 = await publicClient.readContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "standing",
      args: [1n, aliceAccount.address],
    });
    // Alice paidThrough = 1, currentPeriod = 0, offset = 1 - 0 - 1 = 0
    expect(standingAlice0[0]).toBe(1);
    expect(standingAlice0[1]).toBe(0);
    expect(standingAlice0[2]).toBe(0n);

    const standingBob0 = await publicClient.readContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "standing",
      args: [1n, bobAccount.address],
    });
    // Bob paidThrough = 3, currentPeriod = 0, offset = 3 - 0 - 1 = 2
    expect(standingBob0[0]).toBe(3);
    expect(standingBob0[1]).toBe(0);
    expect(standingBob0[2]).toBe(2n);

    // 4. Advance time by 4 days (4 periods)
    await publicClient.request({
      // @ts-expect-error Anvil RPC method
      method: "evm_increaseTime",
      params: [86400 * 4],
    });
    await publicClient.request({
      // @ts-expect-error Anvil RPC method
      method: "evm_mine",
      params: [],
    });

    // Check standings at period 4
    const standingAlice4 = await publicClient.readContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "standing",
      args: [1n, aliceAccount.address],
    });
    // Alice paidThrough = 1, currentPeriod = 4, offset = 1 - 4 - 1 = -4 (arrears)
    expect(standingAlice4[0]).toBe(1);
    expect(standingAlice4[1]).toBe(4);
    expect(standingAlice4[2]).toBe(-4n);

    const standingBob4 = await publicClient.readContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "standing",
      args: [1n, bobAccount.address],
    });
    // Bob paidThrough = 3, currentPeriod = 4, offset = 3 - 4 - 1 = -2
    expect(standingBob4[0]).toBe(3);
    expect(standingBob4[1]).toBe(4);
    expect(standingBob4[2]).toBe(-2n);

    // 5. Alice pays 2 periods of arrears
    // Alice base was 1, pays 2 -> paidThrough becomes 3
    const aliceCatchUpHash = await aliceClient.writeContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "pay",
      args: [1n, 2],
      value: dues * 2n,
    });
    await publicClient.waitForTransactionReceipt({ hash: aliceCatchUpHash });

    const standingAliceCatchUp = await publicClient.readContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "standing",
      args: [1n, aliceAccount.address],
    });
    expect(standingAliceCatchUp[0]).toBe(3);
    expect(standingAliceCatchUp[2]).toBe(-2n); // 3 - 4 - 1 = -2

    // 6. Check pending balance for treasurer: 1 + 3 + 2 = 6 dues = 0.6 BOT
    const pending = await publicClient.readContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "pending",
      args: [treasurerAccount.address],
    });
    expect(pending).toBe(dues * 6n);

    // 7. Treasurer withdraws
    const balBefore = await publicClient.getBalance({ address: treasurerAccount.address });
    const withdrawHash = await treasurerClient.writeContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "withdraw",
    });
    const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    const gasUsed = withdrawReceipt.gasUsed * withdrawReceipt.effectiveGasPrice;
    const balAfter = await publicClient.getBalance({ address: treasurerAccount.address });

    expect(balAfter).toBe(balBefore + dues * 6n - gasUsed);

    const pendingAfter = await publicClient.readContract({
      address: contractAddress,
      abi: ROLL_ABI,
      functionName: "pending",
      args: [treasurerAccount.address],
    });
    expect(pendingAfter).toBe(0n);
  });
});

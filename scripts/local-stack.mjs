#!/usr/bin/env node
import { spawn } from "child_process";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const PORT = 8753;
const RPC_URL = `http://127.0.0.1:${PORT}`;

// 10 default anvil accounts
const PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Treasurer 1
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Member A
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Member B
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Member C
  "0x47e179ec197488593b100287e941669c6bf3605b514b4aeeb33a498f8b3384b8", // 4: Member D
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // 5: Member E
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d4b9a8e63da35828d0", // 6: Member F
  "0x4bbbf856042410b379d278eee7408a0db70ac6a050d0d53043d347285d422b61", // 7: Member G
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97", // 8: Member H
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073747b1a4377", // 9: Member I
];

async function main() {
  console.log(`Starting Anvil on port ${PORT}...`);
  const anvil = spawn("anvil", ["--port", String(PORT), "--silent"], {
    stdio: "inherit",
  });

  process.on("SIGINT", () => {
    anvil.kill();
    process.exit();
  });
  process.on("SIGTERM", () => {
    anvil.kill();
    process.exit();
  });

  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  });

  // Wait for anvil
  for (let i = 0; i < 40; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const accounts = PRIVATE_KEYS.map((pk) => privateKeyToAccount(pk as `0x${string}`));
  const clients = accounts.map((account) =>
    createWalletClient({
      account,
      transport: http(RPC_URL),
    })
  );

  // Deploy contract
  const artifactPath = resolve(process.cwd(), "contracts/out/Roll.sol/Roll.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const bytecode = artifact.bytecode.object as `0x${string}`;
  const abi = artifact.abi;

  const deployHash = await clients[0].deployContract({
    abi,
    bytecode,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contractAddress = receipt.contractAddress as Address;

  console.log(`Roll deployed at: ${contractAddress}`);

  // Write .env.local for local stack
  const envContent = [
    `NEXT_PUBLIC_CONTRACT_31337=${contractAddress}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_31337=1`,
    `NEXT_PUBLIC_RPC_URL_31337=${RPC_URL}`,
    "",
  ].join("\n");
  writeFileSync(resolve(process.cwd(), ".env.local"), envContent);
  console.log("Updated .env.local with local stack contract address");

  const now = (await publicClient.getBlock()).timestamp;

  // Club 1: Running Club with 8 seeded members (various standings, 1 removed)
  // startsAt = now - 2 days (2 periods ago)
  const dues1 = parseEther("0.05");
  const period1 = 86400; // 1 day
  const startsAt1 = now - BigInt(period1 * 2);

  const openTx1 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Pacific Coast Runners", dues1, period1, startsAt1],
  });
  await publicClient.waitForTransactionReceipt({ hash: openTx1 });

  // Members paying dues for Club 1:
  // Member A (clients[1]): pays 2 periods -> paidThrough = 2, curPeriod = 2 -> offset = 2 - 2 - 1 = -1 (1 behind)
  const pay1A = await clients[1].writeContract({
    address: contractAddress,
    abi,
    functionName: "pay",
    args: [1n, 2],
    value: dues1 * 2n,
  });
  await publicClient.waitForTransactionReceipt({ hash: pay1A });

  // Member B (clients[2]): pays 3 periods -> paidThrough = 3, curPeriod = 2 -> offset = 3 - 2 - 1 = 0 (paid through!)
  const pay1B = await clients[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "pay",
    args: [1n, 3],
    value: dues1 * 3n,
  });
  await publicClient.waitForTransactionReceipt({ hash: pay1B });

  // Member C (clients[3]): pays 3 periods -> paidThrough = 3; then we will pay 2 more? cur = 2, max is 5.
  // Let's pay 3, then 1 more -> paidThrough = 4 -> offset = 4 - 2 - 1 = 1 (1 ahead)
  const pay1C = await clients[3].writeContract({
    address: contractAddress,
    abi,
    functionName: "pay",
    args: [1n, 3],
    value: dues1 * 3n,
  });
  await publicClient.waitForTransactionReceipt({ hash: pay1C });
  const pay1C2 = await clients[3].writeContract({
    address: contractAddress,
    abi,
    functionName: "pay",
    args: [1n, 1],
    value: dues1,
  });
  await publicClient.waitForTransactionReceipt({ hash: pay1C2 });

  // Member D (clients[4]): pays 1 period, then is removed by treasurer
  const pay1D = await clients[4].writeContract({
    address: contractAddress,
    abi,
    functionName: "pay",
    args: [1n, 1],
    value: dues1,
  });
  await publicClient.waitForTransactionReceipt({ hash: pay1D });
  const remove1D = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "remove",
    args: [1n, accounts[4].address],
  });
  await publicClient.waitForTransactionReceipt({ hash: remove1D });

  // Member E (clients[5]): pays 3 periods -> paid through
  const pay1E = await clients[5].writeContract({
    address: contractAddress,
    abi,
    functionName: "pay",
    args: [1n, 3],
    value: dues1 * 3n,
  });
  await publicClient.waitForTransactionReceipt({ hash: pay1E });

  // Member F (clients[6]): pays 2 periods -> 1 behind
  const pay1F = await clients[6].writeContract({
    address: contractAddress,
    abi,
    functionName: "pay",
    args: [1n, 2],
    value: dues1 * 2n,
  });
  await publicClient.waitForTransactionReceipt({ hash: pay1F });

  // Club 2: Future / not started yet (starts in 3 days)
  const startsAt2 = now + 86400n * 3n;
  const openTx2 = await clients[1].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["NextGen Climbers Club", parseEther("0.1"), 86400 * 7, startsAt2],
  });
  await publicClient.waitForTransactionReceipt({ hash: openTx2 });

  // Club 3: Handed-over treasurer (opened by clients[2], handed over to clients[3])
  const openTx3 = await clients[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Archery Society", parseEther("0.02"), 86400 * 14, now],
  });
  await publicClient.waitForTransactionReceipt({ hash: openTx3 });

  // Member pays before handover
  const pay3 = await clients[7].writeContract({
    address: contractAddress,
    abi,
    functionName: "pay",
    args: [3n, 1],
    value: parseEther("0.02"),
  });
  await publicClient.waitForTransactionReceipt({ hash: pay3 });

  // Hand over to clients[3]
  const handoverTx = await clients[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "handOver",
    args: [3n, accounts[3].address],
  });
  await publicClient.waitForTransactionReceipt({ hash: handoverTx });

  // Club 4: Brand new with no members
  const openTx4 = await clients[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Philosophy & Chai", parseEther("0.01"), 86400 * 30, now],
  });
  await publicClient.waitForTransactionReceipt({ hash: openTx4 });

  console.log("Seeding complete! 4 clubs seeded with varied states.");
  console.log("Local stack ready at http://localhost:3000 (running against port 8753)");
}

main().catch(console.error);

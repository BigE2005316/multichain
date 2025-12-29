// Fetch a Solana transaction by signature using the centralized rpcManager
async function getTx(signature) {
  try {
    return await rpcManager.executeWithRetry('solana', async (connection) => {
      return await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
    }, 3);
  } catch (err) {
    console.warn(`⚠️ getTx failed for ${signature}: ${err.message}`);
    return null;
  }
}

// Fetch recent transaction signatures for a Solana address (leader)
async function getRecentSignatures(leader, before = null, limit = 20) {
  const publicKey = new PublicKey(leader);
  // Use the centralized rpcManager for robust connection handling
  return await rpcManager.executeWithRetry('solana', async (connection) => {
    const opts = { limit };
    if (before) opts.before = before;
    return await connection.getSignaturesForAddress(publicKey, opts);
  }, 3);
}

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer: splTransfer, getAssociatedTokenAddress } = require('@solana/spl-token');
const LeaderStateSOL = require('../models/LeaderState');
const UserSOL = require('../models/User');
const { getPrivateKeyFromRef: getPK } = require('../utils/envKeys');
const bs58 = require('bs58');

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const { getRPCManager } = require('../../services/rpcManager');

// NOTE: Do not create a static Connection here; use the centralized RPC manager
// which provides failover, retries and health checks. Calls below request a
// healthy connection per-call via rpcManager.executeWithRetry.
const rpcManager = getRPCManager();

function parseKeypairFromSecret(secretStr) {
  // Accept: base58-encoded secret, or JSON array (Uint8Array)
  try {
    if (secretStr.trim().startsWith('[')) {
      const arr = JSON.parse(secretStr);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    // else base58
    return Keypair.fromSecretKey(bs58.decode(secretStr));
  } catch (e) {
    throw new Error('Invalid SOL privateKeyRef format (expect base58 or JSON array)');
  }
}

async function loadFollowerSolKeypair(user) {
  const exec = user?.execWallets?.SOL;
  if (!exec?.privateKeyRef) throw new Error('Follower has no SOL exec wallet/privateKeyRef');
  const raw = await getPK(exec.privateKeyRef); // e.g. process.env[ref]
  const kp = parseKeypairFromSecret(raw);
  return { kp, address: kp.publicKey.toBase58() };
}

function decodeSystemTransferFromCompiledIx(ci, accountKeys) {
  // ci: CompiledInstruction { programIdIndex, accountKeyIndexes, data (Buffer) }
  if (!ci || !Array.isArray(ci.accountKeyIndexes) || ci.accountKeyIndexes.length < 2) return null;
  if (!accountKeys || typeof ci.programIdIndex !== 'number' || !accountKeys[ci.programIdIndex]) return null;
  const programId = accountKeys[ci.programIdIndex];
  if (!programId.equals(SystemProgram.programId)) return null;

  // If data is already a Buffer, use it directly
  const data = Buffer.isBuffer(ci.data) ? ci.data : Buffer.from(ci.data, 'base64');
  if (data.length < 4) return null;
  const opcode = data.readUInt32LE(0);

  if (opcode === 2) {
    if (data.length < 12) return null;
    if (ci.accountKeyIndexes.length < 2) return null;
    const lamports = Number(data.readBigUInt64LE(4));
    const from = accountKeys[ci.accountKeyIndexes[0]];
    const to = accountKeys[ci.accountKeyIndexes[1]];
    return { kind: 'transfer', from, to, lamports };
  } else if (opcode === 12) {
    if (data.length < 12) return null;
    if (ci.accountKeyIndexes.length < 2) return null;
    const lamports = Number(data.readBigUInt64LE(4));
    const fromBase = accountKeys[ci.accountKeyIndexes[0]];
    const to = accountKeys[ci.accountKeyIndexes[1]];
    return { kind: 'transferWithSeed', from: fromBase, to, lamports };
  }
  return null;
}
// function decodeSystemTransferFromCompiledIx(ci, accountKeys) {
//   // ci: CompiledInstruction { programIdIndex, accounts, data (base64) }
//   if (!ci || !Array.isArray(ci.accounts) || ci.accounts.length < 2) return null;
//   if (!accountKeys || typeof ci.programIdIndex !== 'number' || !accountKeys[ci.programIdIndex]) return null;
//   const programId = accountKeys[ci.programIdIndex];
//   if (!programId.equals(SystemProgram.programId)) return null;

//   const data = Buffer.from(ci.data, 'base64');
//   // SystemInstruction enum (u32 LE)
//   if (data.length < 4) return null;
//   const opcode = data.readUInt32LE(0);

//   // 2 = Transfer, 12 = TransferWithSeed
//   if (opcode === 2) {
//     // layout: u32 opcode, u64 lamports
//     if (data.length < 4 + 8) return null;
//     if (ci.accounts.length < 2) return null;
//     const lamports = Number(data.readBigUInt64LE(4));
//     const from = accountKeys[ci.accounts[0]];
//     const to = accountKeys[ci.accounts[1]];
//     return { kind: 'transfer', from, to, lamports };
//   } else if (opcode === 12) {
//     // TransferWithSeed layout: u32 opcode, u64 lamports, base(32), seed(string), owner(pubkey)
//     // Accounts: [fromBase, to, fromWithSeedBase?] — varies; safest to read accounts[0]=fromBase, accounts[1]=to
//     if (data.length < 4 + 8) return null;
//     if (ci.accounts.length < 2) return null;
//     const lamports = Number(data.readBigUInt64LE(4));
//     const fromBase = accountKeys[ci.accounts[0]];
//     const to = accountKeys[ci.accounts[1]];
//     return { kind: 'transferWithSeed', from: fromBase, to, lamports };
//   }
//   return null;
// }

// From a confirmed tx, extract SOL transfers where leader is the sender.
function extractLeaderSolTransfers(tx, leaderPubkey) {
  const message = tx.transaction.message;
  const keys = message.getAccountKeys().staticAccountKeys;
  const out = [];

  for (const ci of message.compiledInstructions) {
    const t = decodeSystemTransferFromCompiledIx(ci, keys);
    if (!t) continue;
    if (t.from.equals(leaderPubkey) && t.lamports > 0) {
      out.push({ to: t.to, lamports: t.lamports });
    }
  }
  return out;
}

// Use token balance diffs to infer SPL transfers made by leader (robust to inner ixs)
async function extractLeaderSplTransfers(tx, leaderPubkey) {
  try {
  const leaderStr = leaderPubkey.toBase58();
  const pre = tx.meta?.preTokenBalances || [];
  const post = tx.meta?.postTokenBalances || [];
  // Map key (owner+mint+accountIndex?) → {amount, decimals}
  const preMap = new Map();
  for (const b of pre) {
    const key = `${b.owner}|${b.mint}`;
    preMap.set(key, {
      amount: BigInt(b.uiTokenAmount?.amount ?? '0'),
      decimals: b.uiTokenAmount?.decimals ?? 0,
    });
  }
  // Collate per (owner|mint)
  const postMap = new Map();
  for (const b of post) {
    const key = `${b.owner}|${b.mint}`;
    postMap.set(key, {
      amount: BigInt(b.uiTokenAmount?.amount ?? '0'),
      decimals: b.uiTokenAmount?.decimals ?? 0,
    });
  }

  // Find leader decreases and counterparty increases; we’ll pair greedily per mint
  // (Good enough for simple transfers; for complex multi-party swaps, you’d decode inner ixs.)
  const decreases = [];
  const increasesByMint = new Map();

  // Decreases from leader
  for (const [key, preVal] of preMap.entries()) {
    const [owner, mint] = key.split('|');
    if (owner !== leaderStr) continue;
    const postVal = postMap.get(key) || { amount: 0n, decimals: preVal.decimals };
    const delta = preVal.amount - BigInt(postVal.amount || 0n);
    if (delta > 0n) {
      decreases.push({ mint, amount: delta, decimals: preVal.decimals });
    }
  }

  // Increases by anyone
  for (const [key, postVal] of postMap.entries()) {
    const [owner, mint] = key.split('|');
    // skip leader increases
    if (owner === leaderStr) continue;
    const preVal = preMap.get(key) || { amount: 0n, decimals: postVal.decimals };
    const delta = BigInt(postVal.amount || 0n) - preVal.amount;
    if (delta > 0n) {
      if (!increasesByMint.has(mint)) increasesByMint.set(mint, []);
      increasesByMint.get(mint).push({ owner, mint, amount: delta, decimals: postVal.decimals });
    }
  }

  const results = [];
  const TradeLog = require('../models/TradeLog');
  for (const s of newOnes.reverse()) {
    const tx = await getTx(s.signature);
    console.log(`tx`)
    console.log(tx)
    if (!tx) continue;

    // Extract trade details (example for swap, adapt as needed)
    const leaderTx = s.signature;
    const chain = 'SOL';
    const tokenIn = '...'; // Fill with actual logic
    const tokenOut = '...'; // Fill with actual logic
    const amountIn = '...'; // Fill with actual logic
    const amountOutMin = '...'; // Fill with actual logic
    const idempotencyKey = `${chain}:${leaderTx}`;

    // Check if TradeLog already exists (idempotency)
    let logDoc = await TradeLog.findOne({ idempotencyKey });
    if (!logDoc) {
      logDoc = await TradeLog.create({
        chain,
        leader,
        leaderTx,
        tokenIn,
        tokenOut,
        amountIn: String(amountIn),
        amountOutMin: String(amountOutMin),
        parsedAt: new Date(),
        idempotencyKey,
        followers: followers.map(f => ({
          userId: f.userId,
          status: 'QUEUED'
        }))
      });
    }

    // Notify only followers whose status is QUEUED
    for (const f of followers.filter(x => x.active)) {
      const user = await UserSOL.findById(f.userId).lean();
      if (!user) continue;
      const followerEntry = logDoc.followers.find(fl => fl.userId.toString() === f.userId.toString());
      if (!followerEntry || followerEntry.status !== 'QUEUED') continue;

      await botInstance.telegram.sendMessage(
        user.tgId,
        `🔔 Trade detected for leader ${leader}.\nDo you want to copy this trade?\n\nDetails:\n• Token: ${tokenIn}\n• Amount: ${amountIn}\n• Type: ...`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Accept', callback_data: `copytrade_accept_${logDoc._id}` },
                { text: '❌ Decline', callback_data: `copytrade_decline_${logDoc._id}` }
              ]
            ]
          }
        }
      );
    }
    // Remove direct execution:
    // await mirrorSolTxAsSwap(leader, tx, followers);
    return tx;
  }
    
  } catch (err) {
    console.warn(`⚠️ getTx failed for ${signature}: ${err.message}`);
    return null;
  }
}


function isSystemTransfer(ix, message) {
  return ix.programId.equals(SystemProgram.programId) && message.instructions.includes(ix);
}


function isTokenProgramIx(ix) {
  return ix.programId.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
}


// async function mirrorSolTx(leader, tx, followers) {
// const message = tx.transaction.message;
// const accountKeys = message.getAccountKeys().staticAccountKeys;
// const instructions = message.compiledInstructions;


// // Basic: mirror SOL transfers from leader and SPL transfers from leader
// for (const f of followers.filter(x => x.active)) {
// const user = await UserSOL.findById(f.userId).lean();
// console.log("user")
// console.log(user)
// }}

function extractLeaderSolTransfers(tx, leaderPubkey) {
  const message = tx.transaction.message;
  const keys = message.getAccountKeys().staticAccountKeys;
  const out = [];

  for (const ci of message.compiledInstructions) {
    const t = decodeSystemTransferFromCompiledIx(ci, keys);
    if (!t) continue;
    if (t.from.equals(leaderPubkey) && t.lamports > 0) {
      out.push({ to: t.to, lamports: t.lamports });
    }
  }
  return out;
}

// ---- Swap extraction: balance diffs + inner instructions ----
/**
 * Detects a swap made by `leaderPubkey`:
 *   - Finds the largest negative mint (input) and largest positive mint (output) for the leader
 *   - Also parses inner SPL transfers to improve recall on routed swaps
 * Return: { inputMint, outputMint, inputRaw, outputRaw, routeHints }
 */
function detectLeaderSwap(tx, leaderPubkey) {
  const leaderStr = leaderPubkey.toBase58();
  const pre = tx.meta?.preTokenBalances || [];
  const post = tx.meta?.postTokenBalances || [];

  // Maps: key = (owner|mint) → { amount(raw BigInt), decimals }
  const preMap = new Map();
  for (const b of pre) {
    const key = `${b.owner}|${b.mint}`;
    preMap.set(key, {
      amount: BigInt(b.uiTokenAmount?.amount ?? '0'),
      decimals: b.uiTokenAmount?.decimals ?? 0,
    });
  }
  const postMap = new Map();
  for (const b of post) {
    const key = `${b.owner}|${b.mint}`;
    postMap.set(key, {
      amount: BigInt(b.uiTokenAmount?.amount ?? '0'),
      decimals: b.uiTokenAmount?.decimals ?? 0,
    });
  }

  // Collect deltas for the leader only
  const deltas = []; // { mint, rawDelta (post-pre), decimals }
  const mintsSet = new Set();

  for (const [key, preVal] of preMap.entries()) {
    const [owner, mint] = key.split('|');
    if (owner !== leaderStr) continue;
    const postVal = postMap.get(key) || { amount: 0n, decimals: preVal.decimals };
    const rawDelta = BigInt(postVal.amount || 0n) - preVal.amount;
    if (rawDelta !== 0n) {
      deltas.push({ mint, rawDelta, decimals: preVal.decimals });
      mintsSet.add(mint);
    }
  }

  // Sometimes a mint only appears post (new ATA), include those too
  for (const [key, postVal] of postMap.entries()) {
    const [owner, mint] = key.split('|');
    if (owner !== leaderStr) continue;
    if (!preMap.has(key)) {
      const rawDelta = BigInt(postVal.amount || 0n) - 0n;
      if (rawDelta !== 0n) {
        deltas.push({ mint, rawDelta, decimals: postVal.decimals });
        mintsSet.add(mint);
      }
    }
  }

  // Inner instruction “spl-token” transfers can help identify route mints
  const innerMints = new Set();
  const inner = tx.meta?.innerInstructions || [];
  for (const innerIx of inner) {
    for (const ix of innerIx.instructions || []) {
      // web3.js "getTransaction" does not auto-parse program; ix.program may be undefined.
      // When RPC returns parsed data, ix.program could be "spl-token" and ix.parsed.* available.
      const program = ix.program || ix.programId || '';
      if (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') {
        const mint = ix.parsed?.info?.mint;
        if (mint) innerMints.add(mint);
      }
    }
  }

  // Decide input/output:
  // Choose the largest magnitude negative delta as input, largest positive as output.
  const negs = deltas.filter(d => d.rawDelta < 0n);
  const poss = deltas.filter(d => d.rawDelta > 0n);

  // If nothing in token balances changed, attempt to infer SOL ↔ token via pre/post SOL
  // (Jito tips or fees won’t show as token deltas; for pure SOL→token swaps, leader’s WSOL ATA will be used if wrapped)
  let inputMint = null;
  let outputMint = null;
  let inputRaw = null;
  let outputRaw = null;

  if (negs.length > 0) {
    negs.sort((a, b) => (a.rawDelta < b.rawDelta ? -1 : 1)); // most negative first
    const inp = negs[0];
    inputMint = inp.mint;
    inputRaw = (-inp.rawDelta); // make positive
  }

  if (poss.length > 0) {
    poss.sort((a, b) => (a.rawDelta > b.rawDelta ? -1 : 1)); // largest positive first
    const outp = poss[0];
    outputMint = outp.mint;
    outputRaw = outp.rawDelta;
  }

  // If still missing something, check whether SOL (WSOL) likely involved:
  // Heuristic: logs contain WSOL ATA create/close or inner mints include WSOL
  if ((!inputMint || !outputMint) && (innerMints.has(WSOL_MINT) || mintsSet.has(WSOL_MINT))) {
    if (!inputMint) inputMint = WSOL_MINT;
    if (!outputMint) outputMint = WSOL_MINT; // will be corrected by poss/negs next time
  }

  if (!inputMint || !outputMint || !inputRaw || !outputRaw) {
    return null; // Not a clean swap we can replicate
  }

  return {
    inputMint,
    outputMint,
    inputRaw,   // raw base units (BigInt of leader’s size OUT)
    outputRaw,  // raw base units (BigInt of leader’s size IN)
    routeHints: Array.from(innerMints),
  };
}

// ---- Jupiter integration ----
// Docs: https://station.jup.ag/docs/apis/quote-api
async function jupiterQuote({ inputMint, outputMint, amountRaw, slippageBps = 50 }) {
  const url = 'https://quote-api.jup.ag/v6/quote';
  const { data } = await axios.get(url, {
    params: {
      inputMint,
      outputMint,
      amount: amountRaw.toString(), // in base units
      slippageBps,
      onlyDirectRoutes: false,
      asLegacyTransaction: false,
    },
    timeout: 10_000,
  });
  if (!data || !data.routePlan || data.routePlan.length === 0) {
    throw new Error('No Jupiter route found');
  }
  return data; // quoteResponse
}

async function jupiterBuildSwapTx({ quoteResponse, userPublicKey, wrapAndUnwrapSol = true, dynamicComputeUnitLimit = true }) {
  const url = 'https://quote-api.jup.ag/v6/swap';
  const { data } = await axios.post(url, {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol,
    dynamicComputeUnitLimit,
    useSharedAccounts: true,
    // prioritizationFeeLamports: "auto" // optional
  }, { timeout: 10_000 });
  // data = { swapTransaction (base64), lastValidBlockHeight, ... }
  return data;
}

async function sendBase64TxViaQuickNode(base64Txn, signerKP) {
  const raw = Buffer.from(base64Txn, 'base64');
  const vtx = VersionedTransaction.deserialize(raw);
  vtx.sign([signerKP]);
  // Use RPC manager to pick healthy endpoint and perform send + confirm with retries
  const sig = await rpcManager.executeWithRetry('solana', async (rpc) => {
    const s = await rpc.sendTransaction(vtx, { skipPreflight: false, preflightCommitment: 'confirmed' });
    await rpc.confirmTransaction(s, 'confirmed');
    return s;
  }, 4);
  return sig;
}


async function mirrorSolTx(leader, tx, followers) {
  const leaderPubkey = new PublicKey(leader);

  // 1) Extract leader-origin SOL transfers
  const solTransfers = extractLeaderSolTransfers(tx, leaderPubkey); // [{to, lamports}]

  // 2) Extract leader-origin SPL transfers via balance diffs
  const splTransfers = extractLeaderSplTransfers(tx, leaderPubkey); // [{mint, toOwner, rawAmount, decimals}]

  if (solTransfers.length === 0 && splTransfers.length === 0) {
    return; // nothing to mirror
  }

  for (const f of followers.filter(x => x.active)) {
    const user = await UserSOL.findById(f.userId).lean();
    if (!user) continue;

    // Load follower execution wallet
    let followerKP;
    try {
      const { kp } = await loadFollowerSolKeypair(user);
      followerKP = kp;
    } catch (e) {
      console.warn(`Follower ${f.userId} missing/invalid SOL key: ${e.message}`);
      continue;
    }

    // Mirror SOL transfers
    for (const t of solTransfers) {
      const followerLamports = Math.max(1, Math.floor(t.lamports * (f.ratio || 1)));
      try {
        // choose destination: here we mirror to the same recipient as leader used
        const destination = t.to;

        // Check balance
        const bal = await connection.getBalance(followerKP.publicKey, 'processed');
        const FEE_BUFFER = 5000; // a few microsol for fees
        if (bal < followerLamports + FEE_BUFFER) {
          console.log(`Skip SOL transfer for follower ${user.tgId || user._id}: insufficient SOL`);
          continue;
        }

        const txi = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: followerKP.publicKey,
            toPubkey: destination,
            lamports: followerLamports,
          })
        );
        txi.feePayer = followerKP.publicKey;
        const sig = await sendAndConfirmTransaction(connection, txi, [followerKP], {
          commitment: 'confirmed',
          skipPreflight: false,
        });
        console.log(`✅ Mirrored SOL transfer: follower ${f.userId} -> ${destination.toBase58()} (${followerLamports} lamports) sig=${sig}`);
      } catch (err) {
        console.warn('SOL mirror error:', err?.message || err);
      }
    }

    // Mirror SPL token transfers
    for (const t of splTransfers) {
      try {
        const mint = new PublicKey(t.mint);
        const toOwner = new PublicKey(t.toOwner);

        // follower raw amount (token base units)
        const followerRaw = BigInt(
          Math.max(1, Number(t.rawAmount) * (f.ratio || 1))
        );

        // Source ATA (follower), Destination ATA (toOwner)
        const sourceAta = await getOrCreateAssociatedTokenAccount(
          connection,
          followerKP,                  // payer
          mint,
          followerKP.publicKey         // owner
        );
        const destAta = await getOrCreateAssociatedTokenAccount(
          connection,
          followerKP,                  // payer
          mint,
          toOwner                      // dest owner (same as leader's recipient)
        );

        // Quick balance check
        const srcBal = await connection.getTokenAccountBalance(sourceAta.address, 'processed')
          .catch(() => null);
        const srcRaw = BigInt(srcBal?.value?.amount ?? '0');
        if (srcRaw < followerRaw) {
          console.log(`Skip SPL transfer for follower ${user.tgId || user._id}: insufficient token balance (${t.mint})`);
          continue;
        }

        const sig = await splTransfer(
          connection,
          followerKP,                     // payer & owner
          sourceAta.address,              // from ATA
          destAta.address,                // to ATA
          followerKP.publicKey,           // owner
          followerRaw
        );
        console.log(`✅ Mirrored SPL transfer: follower ${f.userId} -> ${toOwner.toBase58()} mint=${t.mint} amount(raw)=${followerRaw} sig=${sig}`);
      } catch (err) {
        console.warn('SPL mirror error:', err?.message || err);
      }
    }
  }
}

// ---- Mirror (copy) logic per txn ----
async function mirrorSolTxAsSwap(leader, tx, followers, defaultSlippageBps = 50) {
  const leaderPubkey = new PublicKey(leader);

  // 1) Try to detect a swap
  const swap = detectLeaderSwap(tx, leaderPubkey);
  if (!swap) {
    // Optionally also mirror plain SOL transfers if you want:
    // const solTransfers = extractLeaderSolTransfers(tx, leaderPubkey);
    return; // nothing actionable as a swap
  }

  // swap: { inputMint, outputMint, inputRaw (leader spent), outputRaw (leader got) }
  for (const f of followers.filter(x => x.active)) {
    // Load follower user & exec wallet
    const user = await User.findById(f.userId).lean();
    if (!user) continue;

    let followerKP;
    try {
      const { kp } = await loadFollowerSolKeypair(user);
      followerKP = kp;
    } catch (e) {
      console.warn(`Follower ${f.userId} missing/invalid SOL key: ${e.message}`);
      continue;
    }

    // Scale amount with ratio; cap with maxUsdPerTrade if you have on-chain pricing elsewhere (omitted here).
    const ratio = f.ratio || 1;
    const followerInputRaw = BigInt(Math.max(1, Number(swap.inputRaw) * ratio));

    // 2) Get Jupiter quote for follower size
    let quote;
    try {
      quote = await jupiterQuote({
        inputMint: swap.inputMint,
        outputMint: swap.outputMint,
        amountRaw: followerInputRaw,
        slippageBps: f.slippageBps ?? defaultSlippageBps,
      });
    } catch (err) {
      console.warn(`Jupiter quote failed for follower ${f.userId}:`, err?.message || err);
      continue;
    }

    // 3) Build swap txn (serialized) for follower
    let swapTx;
    try {
      swapTx = await jupiterBuildSwapTx({
        quoteResponse: quote,
        userPublicKey: followerKP.publicKey.toBase58(),
        wrapAndUnwrapSol: true, // handle SOL input/output automatically
      });
    } catch (err) {
      console.warn(`Jupiter build failed for follower ${f.userId}:`, err?.message || err);
      continue;
    }

    // 4) Sign & send via QuickNode
    try {
      const sig = await sendBase64TxViaQuickNode(swapTx.swapTransaction, followerKP);
      console.log(`✅ Copy-trade executed for follower ${f.userId}: ${sig}`);
    } catch (err) {
      console.warn(`Copy-trade send failed for follower ${f.userId}:`, err?.message || err);
    }
  }
}

const TradeLog = require('../models/TradeLog');

async function pollSolLeader(leader, followers, botInstance) {
  console.log("start ensure sol state");
  const state = await ensureStateSOL(leader);
  console.log("getRecentSignatures");

  const sigs = await getRecentSignatures(leader, null, 20);
  if (!sigs || sigs.length === 0) return;
  console.log('signatures');
  console.log(sigs);

  const last = state.lastSignature;
  console.log(`last is: ${last}`);
  let newOnes = sigs;
  if (last) {
    const idx = sigs.findIndex(s => s.signature === last);
    if (idx >= 0) newOnes = sigs.slice(0, idx + 1); // newer than last
  }

  console.log("start processing oldest-first");
  // Process oldest-first
  for (const s of newOnes.reverse()) {
    const tx = await getTx(s.signature);
    console.log(`tx`);
    console.log(tx);
    if (!tx) continue;


    // Extract trade details from the tx object
    const leaderTx = s.signature;
    const chain = 'SOL';
    let tokenIn = 'Unknown', tokenOut = 'Unknown', amountIn = 'Unknown', amountOutMin = 'Unknown';
    const leaderPubkey = new PublicKey(leader);
    debugger
    const swap = detectLeaderSwap(tx, leaderPubkey);
    debugger
    let solTransfers;
    if (swap) {
      tokenIn = swap.inputMint;
      tokenOut = swap.outputMint;
      amountIn = swap.inputRaw.toString();
      amountOutMin = swap.outputRaw.toString();
    } else {
      debugger
      // Fallback: try to extract a simple SOL transfer
      solTransfers = extractLeaderSolTransfers(tx, leaderPubkey);
      debugger

      if (solTransfers.length > 0) {
        tokenIn = 'SOL';
        tokenOut = solTransfers.map(t => t.to.toBase58()).join(', ');
        amountIn = solTransfers.map(t => t.lamports).join(', ');
        amountOutMin = '0';
      } else {
        // As a last resort, try to extract SOL sent from leader's account (native transfer)
        try {
          const message = tx.transaction?.message;
              debugger

          const accountKeys = message?.getAccountKeys?.().staticAccountKeys;
              debugger

          if (message && accountKeys) {
            for (const ci of message.compiledInstructions || []) {
              if (ci && Array.isArray(ci.accounts) && ci.accounts.length >= 2) {
                const from = accountKeys[ci.accounts[0]];
                const to = accountKeys[ci.accounts[1]];
                    debugger

                if (from && from.equals(leaderPubkey)) {
                  tokenIn = 'SOL';
                  tokenOut = to?.toBase58?.() || 'Unknown';
                  // Try to get lamports from instruction data
                  const data = Buffer.from(ci.data, 'base64');
                      debugger

                  if (data.length >= 12) {
                    amountIn = data.readBigUInt64LE(4).toString();
                  } else {
                    amountIn = 'Unknown';
                  }
                  amountOutMin = '0';
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.warn('Fallback SOL extraction failed:', err?.message || err);
        }
        // If still unknown, log for debugging
        if (tokenIn === 'Unknown' && tokenOut === 'Unknown') {
          console.warn('[Trade Extraction] Could not extract trade details for tx:', s.signature);
        }
      }
    }
    const idempotencyKey = `${chain}:${leaderTx}`;

    // Check if TradeLog already exists (idempotency)
    let logDoc = await TradeLog.findOne({ idempotencyKey });
        debugger

    if (!logDoc) {
      logDoc = await TradeLog.create({
        chain,
        leader,
        leaderTx,
        tokenIn,
        tokenOut,
        amountIn: String(amountIn),
        amountOutMin: String(amountOutMin),
        parsedAt: new Date(),
        idempotencyKey,
        followers: followers.map(f => ({
          userId: f.userId,
          status: 'QUEUED'
        }))
      });
    }

    // Notify only followers whose status is QUEUED
    for (const f of followers.filter(x => x.active)) {
      const user = await UserSOL.findById(f.userId).lean();
      if (!user) continue;
      const followerEntry = logDoc.followers.find(fl => fl.userId.toString() === f.userId.toString());
      if (!followerEntry || followerEntry.status !== 'QUEUED') continue;

      let type = 'Unknown';
      if (swap) {
        type = 'Swap';
      } else if (solTransfers.length > 0) {
        type = 'SOL Transfer';
      } else if (tokenIn !== 'Unknown' && tokenIn !== 'SOL') {
        type = 'Token Transfer';
      }
      await botInstance.telegram.sendMessage(
        user.tgId,
        `🔔 Trade detected for leader ${leader}.\nDo you want to copy this trade?\n\nDetails:\n• Token: ${tokenIn}\n• Amount: ${amountIn}\n• Type: ${type}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Accept', callback_data: `copytrade_accept_${logDoc._id}` },
                { text: '❌ Decline', callback_data: `copytrade_decline_${logDoc._id}` }
              ]
            ]
          }
        }
      );
    }
    // Do not execute the trade here; wait for user response.
  }

  debugger

  state.lastSignature = sigs[0].signature;
  await state.save();
}
// async function pollSolLeader(leader, followers, botInstance) {
//   console.log("start ensure sol state")
//   const state = await ensureStateSOL(leader);
//   console.log("getRecentSignatures")

//   const sigs = await getRecentSignatures(leader, null, 20);
//   if (!sigs || sigs.length === 0) return;
//   console.log('signatures')
//   console.log(sigs)

//   const last = state.lastSignature;
//   console.log(`last is: ${last}`)
//   let newOnes = sigs;
//   if (last) {
//     const idx = sigs.findIndex(s => s.signature === last);
//     if (idx >= 0) newOnes = sigs.slice(0, idx + 1); // newer than last
//   }

//   console.log("start processing oldest-first")
//   // Process oldest-first
//   for (const s of newOnes.reverse()) {
//     const tx = await getTx(s.signature);
//     console.log(`tx`)
//     console.log(tx)
//     if (!tx) continue;

//     // For each follower, send notification to accept/decline and collect custom params
//     for (const f of followers.filter(x => x.active)) {
//       const user = await UserSOL.findById(f.userId).lean();
//       if (!user) continue;

//       // Here, you would send a Telegram message to the follower (user.tgId)
//       // with details of the detected trade and buttons to Accept/Decline.
//       // On Accept, prompt for custom parameters (amount, slippage, etc.).
//       // This requires botInstance and a handler for the response.

//       // Example (pseudo-code):
//       // await botInstance.telegram.sendMessage(user.tgId, `Trade detected for leader ${leader}. Accept or decline?`, { reply_markup: ... });
//       // On Accept, store pending trade in session and prompt for parameters.
//       // On parameter entry, save to DB or session, then execute copy trade for this user only.


//       await botInstance.telegram.sendMessage(
//         user.tgId,
//         `🔔 Trade detected for leader ${leader}.\nDo you want to copy this trade?\n\nDetails:\n• Token: ...\n• Amount: ...\n• Type: ...`,
//         {
//           reply_markup: {
//             inline_keyboard: [
//               [
//                 { text: '✅ Accept', callback_data: `copytrade_accept_${tradeId}` },
//                 { text: '❌ Decline', callback_data: `copytrade_decline_${tradeId}` }
//               ]
//             ]
//           }
//         }
//       );
//       // For now, skip execution until user accepts and provides parameters.
//       // You may want to store a pending trade log and process it in a handler.
//     }
//     // Remove direct execution:
//     // await mirrorSolTxAsSwap(leader, tx, followers);
//   }


//   state.lastSignature = sigs[0].signature;
//   await state.save();
// }

// Ensure a LeaderState document exists for the given SOL leader
async function ensureStateSOL(leader) {
  const LeaderState = require('../models/LeaderState');
  let state = await LeaderState.findOne({ chain: 'SOL', leader });
  if (!state) {
    state = await LeaderState.create({ chain: 'SOL', leader });
  }
  return state;
}

module.exports = { pollSolLeader, ensureStateSOL, getRecentSignatures, getTx };
const axios = require('axios');
const { ethers } = require('ethers');
const LeaderState = require('../models/LeaderState');
const User = require('../models/User');
const { getPrivateKeyFromRef } = require('../utils/envKeys');


const EVM_RPC = process.env.QUICKNODE_EVM_RPC; // https://...quiknode.pro/.../


// ERC20 ABI minimal
const ERC20_ABI = [
'function transfer(address to, uint256 value) returns (bool)',
'function decimals() view returns (uint8)',
'event Transfer(address indexed from, address indexed to, uint256 value)'
];


async function qnGetTransactionsByAddress(address, page = 1, perPage = 25) {
const { data } = await axios.post(EVM_RPC, {
jsonrpc: '2.0', id: 1, method: 'qn_getTransactionsByAddress',
params: [{ address, page, perPage }]
});
return data.result || [];
}


async function ensureState(chain, leader) {
let s = await WalletFollow.findOne({ chain, leader });
if (!s) s = await WalletFollow.create({ chain, leader, lastBlock: 0, lastSeenTxHashes: [] });
return s;
}


function isNativeTransfer(tx) {
// On QuickNode enhanced result, tx.data may be '0x' for pure ETH transfers
return tx.input === '0x' || !tx.input || tx.input === '0x0';
}


async function getEthersProvider() {
return new ethers.JsonRpcProvider(EVM_RPC);
}


async function handleEvmTxCopy(leader, tx, followers) {
const provider = await getEthersProvider();


// Fetch receipt to inspect logs for ERC20 transfers
const receipt = await provider.getTransactionReceipt(tx.hash);


const isNative = isNativeTransfer(tx);


for (const f of followers.filter(x => x.active)) {
const wallet = new ethers.Wallet(pk, provider);


try {
if (isNative) {
const amount = BigInt(tx.value || '0') * BigInt(Math.floor((f.ratio || 1) * 1e6)) / BigInt(1e6);
if (amount === 0n) continue;
const sent = await wallet.sendTransaction({ to: followerExec, value: amount });
console.log(`[EVM] Mirrored native transfer for follower ${user._id}: ${sent.hash}`);
} else if (receipt && receipt.logs?.length) {
// Look for ERC20 Transfer events where from == leader
const iface = new ethers.Interface(ERC20_ABI);
for (const log of receipt.logs) {
try {
const parsed = iface.parseLog(log);
if (parsed?.name !== 'Transfer') continue;
const from = parsed.args[0].toLowerCase();
const to = parsed.args[1].toLowerCase();
if (from !== leader.toLowerCase()) continue; // only copy outgoing transfers from leader
const tokenAddress = log.address;
const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
const amountRaw = parsed.args[2];
const amountCopy = (amountRaw * BigInt(Math.floor((f.ratio || 1) * 1e6))) / BigInt(1e6);
if (amountCopy === 0n) continue;
const tx2 = await token.transfer(followerExec, amountCopy);
console.log(`[EVM] Mirrored ERC20 transfer ${tokenAddress} for follower ${user._id}: ${tx2.hash}`);
} catch (_) { /* ignore non-ERC20 logs */ }
}
}
} catch (err) {
console.error(`[EVM] Copy trade failed for follower ${user?._id}:`, err.message);
}
}
}


async function pollEvmLeader(leader, followers) {
const state = await ensureState('EVM', leader);
const page = 1; // most recent page
const perPage = 25;
const txs = await qnGetTransactionsByAddress(leader, page, perPage);
if (!Array.isArray(txs) || txs.length === 0) return;


// Filter unseen hashes (we keep a sliding window of lastSeenTxHashes)
const seen = new Set(state.lastSeenTxHashes || []);
const newTxs = txs.filter(t => !seen.has(t.hash));


// Process oldest-first to maintain order
for (const tx of newTxs.reverse()) {
await handleEvmTxCopy(leader, tx, followers);
}


// Maintain lastSeen sliding window (max 200)
const newSeen = [...txs.map(t => t.hash)];
state.lastSeenTxHashes = newSeen.slice(0, 200);
await state.save();
}


module.exports = { pollEvmLeader };
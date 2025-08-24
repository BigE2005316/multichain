function getPrivateKeyFromRef(ref) {
// e.g., ref = 'USER1_EVM_PK' -> process.env.USER1_EVM_PK
if (!ref) throw new Error('privateKeyRef missing');
const key = process.env[ref];
if (!key) throw new Error(`Private key not found for ref ${ref}`);
return key;
}


module.exports = { getPrivateKeyFromRef };
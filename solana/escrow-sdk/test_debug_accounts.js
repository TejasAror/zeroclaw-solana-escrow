const fs = require('fs');
const path = require('path');

const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair } = require("@solana/web3.js");
const NodeWallet = require("@coral-xyz/anchor/dist/cjs/nodewallet").default;

// Read IDL like the compiled code does
const idlPath = path.join(__dirname, 'idl', 'escrow_program.json');
const idlContent = fs.readFileSync(idlPath, 'utf8');
const IDL = JSON.parse(idlContent);

console.log("IDL loaded directly:", IDL.types.map(t => t.name));
console.log("IDL.accounts:", IDL.accounts.map(a => a.name));

// Check the account object passed to typeDefLayout
const account = IDL.accounts[0];
console.log("\nAccount object:", JSON.stringify(account, null, 2));

// Check what types array is passed
console.log("\nTypes array length:", IDL.types.length);
console.log("Types names:", IDL.types.map(t => t.name));

// Now manually test IdlCoder.typeDefLayout
const { IdlCoder } = require("@coral-xyz/anchor/dist/cjs/coder/borsh/idl");

console.log("\n=== Calling typeDefLayout on account ===");
try {
    const layout = IdlCoder.typeDefLayout(account, IDL.types);
    console.log("Layout created successfully!");
} catch (e) {
    console.error("Error:", e.message);
}

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
console.log("IDL.types is array:", Array.isArray(IDL.types));

// Check the Escrow type specifically
const escrowType = IDL.types.find(t => t.name === 'Escrow');
console.log("\nEscrow type:", JSON.stringify(escrowType, null, 2));

// Check EscrowStatus type specifically
const escrowStatusType = IDL.types.find(t => t.name === 'EscrowStatus');
console.log("\nEscrowStatus type:", JSON.stringify(escrowStatusType, null, 2));

// Now manually test the filter logic
const types = IDL.types;
const field = { name: "status", type: { defined: { name: "EscrowStatus" } } };
const defined = field.type.defined.name;
console.log("\nLooking for:", defined);
const filtered = types.filter((t) => t.name === defined);
console.log("Filtered:", filtered.length);
if (filtered.length === 1) {
    console.log("Found:", filtered[0].name);
    console.log("Filtered[0]:", JSON.stringify(filtered[0], null, 2));
} else {
    console.log("NOT FOUND!");
}

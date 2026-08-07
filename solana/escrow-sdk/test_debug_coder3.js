const fs = require('fs');
const path = require('path');

const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair } = require("@solana/web3.js");
const NodeWallet = require("@coral-xyz/anchor/dist/cjs/nodewallet").default;

// Check anchor structure
console.log("anchor keys:", Object.keys(anchor));

// Check anchor.coder
const coder = anchor.coder || anchor.Coder || anchor;
console.log("coder:", coder ? Object.keys(coder) : "undefined");

// Read IDL like the compiled code does
const idlPath = path.join(__dirname, 'idl', 'escrow_program.json');
const idlContent = fs.readFileSync(idlPath, 'utf8');
const IDL = JSON.parse(idlContent);

console.log("\nIDL loaded directly:", IDL.types.map(t => t.name));

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new NodeWallet(Keypair.generate());
const provider = { connection, wallet };

// Create BorshTypesCoder directly
const { BorshTypesCoder } = require("@coral-xyz/anchor/dist/cjs/coder/borsh/types");
const typesCoder = new BorshTypesCoder(IDL);
console.log("TypesCoder created:", typesCoder.typeLayouts.size, "types");
console.log("Type layouts:", Array.from(typesCoder.typeLayouts.keys()));

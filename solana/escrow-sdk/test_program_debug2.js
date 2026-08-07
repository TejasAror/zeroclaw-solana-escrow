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

// Check what happens in BorshTypesCoder
const { BorshTypesCoder } = require("@coral-xyz/anchor/dist/cjs/coder/borsh/types");
const { IdlCoder } = require("@coral-xyz/anchor/dist/cjs/coder/borsh/idl");

// Monkey patch to see what's happening
const originalTypeDefLayout = IdlCoder.typeDefLayout;
let callCount = 0;
IdlCoder.typeDefLayout = function(typeDef, types, name) {
    callCount++;
    if (callCount <= 10) {
        console.log(`\n=== typeDefLayout call #${callCount} ===`);
        console.log("typeDef name:", typeDef.name);
        console.log("typeDef has type:", !!typeDef.type);
        if (typeDef.type && typeDef.type.kind) {
            console.log("typeDef.type.kind:", typeDef.type.kind);
        }
        if (typeDef.type && typeDef.type.defined) {
            console.log("typeDef.type.defined:", typeDef.type.defined);
        }
        console.log("types:", types ? types.map(t => t.name) : "undefined");
        console.log("name:", name);
    }
    return originalTypeDefLayout.call(this, typeDef, types, name);
};

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new NodeWallet(Keypair.generate());
const provider = { connection, wallet };

console.log("\nCreating Program...");
try {
    const program = new anchor.Program(IDL, '8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk', provider);
    console.log("Program created successfully!");
} catch (e) {
    console.error("Error:", e.message);
}

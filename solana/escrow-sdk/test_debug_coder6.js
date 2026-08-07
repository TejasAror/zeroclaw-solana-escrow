const fs = require('fs');
const path = require('path');

const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair } = require("@solana/web3.js");
const NodeWallet = require("@coral-xyz/anchor/dist/cjs/nodewallet").default;

// Read IDL like the compiled code does
const idlPath = path.join(__dirname, 'idl', 'escrow_program.json');
const idlContent = fs.readFileSync(idlPath, 'utf8');
const IDL = JSON.parse(idlContent);

const { IdlCoder } = require("@coral-xyz/anchor/dist/cjs/coder/borsh/idl");

// Monkey patch typeDefLayout to debug the account resolution
const originalTypeDefLayout = IdlCoder.typeDefLayout;
IdlCoder.typeDefLayout = function(typeDef, types, name) {
    if (typeDef.name === "EscrowStatus") {
        console.log("\n=== typeDefLayout called for EscrowStatus ===");
        console.log("typeDef:", JSON.stringify(typeDef, null, 2));
    }
    return originalTypeDefLayout.call(this, typeDef, types, name);
};

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new NodeWallet(Keypair.generate());
const provider = { connection, wallet };

console.log("Creating Program...");
try {
    const program = new anchor.Program(IDL, '8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk', provider);
    console.log("Program created successfully!");
} catch (e) {
    console.error("Error:", e.message);
}

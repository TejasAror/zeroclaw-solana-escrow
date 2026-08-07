const fs = require('fs');
const path = require('path');

const { Program } = require("@coral-xyz/anchor");
const { Connection, Keypair } = require("@solana/web3.js");
const NodeWallet = require("@coral-xyz/anchor/dist/cjs/nodewallet").default;

// Read IDL like the compiled code does
const idlPath = path.join(__dirname, 'idl', 'escrow_program.json');
const idlContent = fs.readFileSync(idlPath, 'utf8');
const IDL = JSON.parse(idlContent);

console.log("IDL loaded directly:", IDL.types.map(t => t.name));

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new NodeWallet(Keypair.generate());
const provider = { connection, wallet };

console.log("Creating Program...");
try {
    const program = new Program(IDL, '8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk', provider);
    console.log("Program created successfully!");
    console.log("Program IDL types:", Object.keys(program.coder.types.typeLayouts));
} catch (e) {
    console.error("Error:", e.message);
    console.error(e.stack);
}

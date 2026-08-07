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

// Monkey-patch IdlCoder to debug
const anchor = require("@coral-xyz/anchor");
const originalFieldLayout = anchor.coder.borsh.idl.IdlCoder.fieldLayout;

anchor.coder.borsh.idl.IdlCoder.fieldLayout = function(field, types) {
    console.log("\n=== fieldLayout called ===");
    console.log("field:", JSON.stringify(field));
    console.log("types array length:", types ? types.length : "undefined");
    if (types) {
        console.log("types names:", types.map(t => t.name));
    }
    
    if (field.type && field.type.defined) {
        const defined = field.type.defined;
        console.log("Looking for defined type:", defined);
        const filtered = types ? types.filter((t) => t.name === defined) : [];
        console.log("Filtered:", filtered.length);
    }
    
    return originalFieldLayout.call(this, field, types);
};

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new NodeWallet(Keypair.generate());
const provider = { connection, wallet };

console.log("Creating Program...");
try {
    const program = new Program(IDL, '8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk', provider);
    console.log("Program created successfully!");
} catch (e) {
    console.error("Error:", e.message);
}

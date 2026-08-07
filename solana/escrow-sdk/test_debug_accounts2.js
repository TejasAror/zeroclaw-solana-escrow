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

// Monkey patch fieldLayout to debug the filter
const originalFieldLayout = IdlCoder.fieldLayout;
IdlCoder.fieldLayout = function(field, types) {
    console.log("\n=== fieldLayout called ===");
    console.log("field:", JSON.stringify(field).substring(0, 200));
    console.log("types length:", types ? types.length : "undefined");
    
    if (field.type && field.type.defined) {
        const defined = field.type.defined.name;
        console.log("Looking for defined type:", defined);
        const filtered = types ? types.filter((t) => t.name === defined) : [];
        console.log("Filtered count:", filtered.length);
        if (filtered.length > 0) {
            console.log("Found:", filtered[0].name, "kind:", filtered[0].type.kind);
        }
    }
    
    return originalFieldLayout.call(this, field, types);
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

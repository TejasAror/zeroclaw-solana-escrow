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
    console.log("\n=== typeDefLayout called ===");
    console.log("typeDef name:", typeDef.name);
    console.log("typeDef:", JSON.stringify(typeDef).substring(0, 300));
    console.log("types length:", types ? types.length : "undefined");
    console.log("types names:", types ? types.map(t => t.name) : "undefined");
    console.log("name:", name);
    return originalTypeDefLayout.call(this, typeDef, types, name);
};

// Monkey patch fieldLayout to debug
const originalFieldLayout = IdlCoder.fieldLayout;
IdlCoder.fieldLayout = function(field, types) {
    if (field.type && field.type.defined && field.type.defined.name === "EscrowStatus") {
        console.log("\n=== fieldLayout for EscrowStatus ===");
        console.log("field:", JSON.stringify(field));
        console.log("types length:", types ? types.length : "undefined");
        console.log("types names:", types ? types.map(t => t.name) : "undefined");
        
        const defined = field.type.defined.name;
        const filtered = types ? types.filter((t) => t.name === defined) : [];
        console.log("Filtered:", filtered.length);
        if (filtered.length > 0) {
            console.log("Found:", filtered[0].name, "kind:", filtered[0].type.kind);
            console.log("Full type:", JSON.stringify(filtered[0], null, 2));
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

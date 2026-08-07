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

// Monkey patch typeDefLayout to debug
const originalTypeDefLayout = IdlCoder.typeDefLayout;
IdlCoder.typeDefLayout = function(typeDef, types, name) {
    console.log("\n=== typeDefLayout called ===");
    console.log("typeDef name:", typeDef.name);
    console.log("typeDef has type:", !!typeDef.type);
    console.log("typeDef.type:", typeDef.type ? JSON.stringify(typeDef.type).substring(0, 100) : "none");
    console.log("types length:", types ? types.length : "undefined");
    console.log("name:", name);
    return originalTypeDefLayout.call(this, typeDef, types, name);
};

// Monkey patch fieldLayout to debug the filter
const originalFieldLayout = IdlCoder.fieldLayout;
IdlCoder.fieldLayout = function(field, types) {
    if (field.type && field.type.defined && field.type.defined.name === "EscrowStatus") {
        console.log("\n=== fieldLayout called for EscrowStatus ===");
        console.log("field:", JSON.stringify(field).substring(0, 200));
        console.log("types length:", types ? types.length : "undefined");
        console.log("types names:", types ? types.map(t => t.name) : "undefined");
        
        const defined = field.type.defined.name;
        console.log("Looking for defined type:", defined);
        const filtered = types ? types.filter((t) => t.name === defined) : [];
        console.log("Filtered count:", filtered.length);
        if (filtered.length > 0) {
            console.log("Found:", filtered[0].name, "kind:", filtered[0].type.kind);
            console.log("Calling typeDefLayout with filtered[0]...");
        } else {
            console.log("NOT FOUND IN TYPES ARRAY!");
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

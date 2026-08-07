const escrow_program_json_1 = require("./idl/escrow_program.json");
const IDL = escrow_program_json_1.default || escrow_program_json_1;

// Simulate what BorshTypesCoder does
const types = IDL.types;

console.log("Types array length:", types.length);
console.log("Types names:", types.map(t => t.name));

// Check if EscrowStatus is in types
const escrowStatusType = types.find(t => t.name === 'EscrowStatus');
console.log("EscrowStatus found:", !!escrowStatusType);
if (escrowStatusType) {
    console.log("EscrowStatus:", JSON.stringify(escrowStatusType, null, 2));
}

// Check Escrow type
const escrowType = types.find(t => t.name === 'Escrow');
console.log("Escrow found:", !!escrowType);
if (escrowType) {
    console.log("Escrow fields:");
    for (const f of escrowType.type.fields) {
        console.log(`  ${f.name}: ${JSON.stringify(f.type)}`);
    }
}

// Now test the filter logic
const defined = "EscrowStatus";
const filtered = types.filter((t) => t.name === defined);
console.log("Filtered for EscrowStatus:", filtered.length);
if (filtered.length === 1) {
    console.log("Found:", filtered[0].name);
} else {
    console.log("NOT FOUND!");
}

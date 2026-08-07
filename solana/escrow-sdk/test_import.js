// Test the exact import pattern used in the compiled code
const escrow_program_json_1 = require("./idl/escrow_program.json");
const idlJson = escrow_program_json_1.default || escrow_program_json_1;

console.log("idlJson type:", typeof idlJson);
console.log("idlJson keys:", Object.keys(idlJson));
console.log("idlJson.types:", idlJson.types ? idlJson.types.map(t => t.name) : "NONE");

// Check EscrowStatus
const escrowStatusType = idlJson.types.find(t => t.name === 'EscrowStatus');
console.log("EscrowStatus found:", !!escrowStatusType);
if (escrowStatusType) {
    console.log("EscrowStatus:", JSON.stringify(escrowStatusType, null, 2));
}

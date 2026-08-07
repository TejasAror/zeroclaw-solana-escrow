const fs = require('fs');
const path = require('path');

// Read the IDL file directly like the compiled JS does
const idlPath = path.join(__dirname, 'idl', 'escrow_program.json');
const idlContent = fs.readFileSync(idlPath, 'utf8');
const IDL = JSON.parse(idlContent);

console.log("Direct load IDL types:", IDL.types ? IDL.types.map(t => t.name) : "NONE");

// Check EscrowStatus
const escrowStatusType = IDL.types.find(t => t.name === 'EscrowStatus');
console.log("EscrowStatus found:", !!escrowStatusType);
if (escrowStatusType) {
    console.log("EscrowStatus:", JSON.stringify(escrowStatusType, null, 2));
}

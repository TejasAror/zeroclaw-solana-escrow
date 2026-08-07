const escrow_program_json_1 = require("./idl/escrow_program.json");
const IDL = escrow_program_json_1.default || escrow_program_json_1;

console.log("IDL type:", typeof IDL);
console.log("IDL keys:", Object.keys(IDL));
console.log("IDL types:", IDL.types ? IDL.types.map(t => t.name) : "NONE");
console.log("IDL accounts:", IDL.accounts ? IDL.accounts.map(a => a.name) : "NONE");
console.log("IDL events:", IDL.events ? IDL.events.map(e => e.name) : "NONE");
console.log("IDL instructions:", IDL.instructions ? IDL.instructions.map(i => i.name) : "NONE");

// Check EscrowStatus
if (IDL.types) {
  for (const t of IDL.types) {
    if (t.name === 'EscrowStatus') {
      console.log("EscrowStatus type:", JSON.stringify(t, null, 2));
      break;
    }
  }
}

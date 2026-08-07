const fs = require('fs');
const path = require('path');

const idlPath = path.join(__dirname, 'idl', 'escrow_program.json');
const idlContent = fs.readFileSync(idlPath, 'utf8');
const IDL = JSON.parse(idlContent);

const types = IDL.types;

// Simulate the buggy filter
const field = {"name":"status","type":{"defined":{"name":"EscrowStatus"}}};
const defined = field.type.defined; // This is an OBJECT, not a string!

console.log("defined:", defined);
console.log("typeof defined:", typeof defined);

const filtered = types.filter((t) => t.name === defined);
console.log("Filtered with object comparison:", filtered.length);

// Correct filter
const definedName = field.type.defined.name;
console.log("defined.name:", definedName);
const filteredCorrect = types.filter((t) => t.name === definedName);
console.log("Filtered with correct comparison:", filteredCorrect.length);

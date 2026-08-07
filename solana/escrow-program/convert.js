const bs58 = require("bs58");
const fs = require("fs");

// Replace this with your Phantom base58 private key LOCALLY.
// Do not share it or commit it to Git.
const privateKey = "4WCREm7EkhDYbmoaUt9W6zunU5R2hxAZX4b5GHUHndRYMjDwsTnXNjqKyjVFvzNLbqohNXZEuymN81hMg4LChnnF";

const decoded = bs58.default.decode(privateKey);

fs.writeFileSync(
  "phantom-keypair.json",
  JSON.stringify(Array.from(decoded))
);

console.log("phantom-keypair.json created!");
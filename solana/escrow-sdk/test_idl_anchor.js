const escrow_program_json_1 = require("./idl/escrow_program.json");
const IDL = escrow_program_json_1.default || escrow_program_json_1;

const { Program } = require("@coral-xyz/anchor");
const { Connection, Keypair } = require("@solana/web3.js");
const NodeWallet = require("@coral-xyz/anchor/dist/cjs/nodewallet").default;

async function test() {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const wallet = new NodeWallet(Keypair.generate());
    const provider = { connection, wallet };
    
    console.log("Creating Program...");
    try {
        const program = new Program(IDL, '8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk', provider);
        console.log("Program created successfully!");
        console.log("Program IDL types:", Object.keys(program.coder.types.typeLayouts));
    } catch (e) {
        console.error("Error:", e.message);
        console.error(e.stack);
    }
}

test();

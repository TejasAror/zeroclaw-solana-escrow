import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { EscrowProgram } from "../target/types/escrow_program";
import { assert } from "chai";

// Constants for u64 max
const U64_MAX = new BN("18446744073709551615");

describe("escrow-program comprehensive tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrowProgram as Program<EscrowProgram>;

  // Test accounts
  const buyer = Keypair.generate();
  const seller = Keypair.generate();
  const unauthorized = Keypair.generate();
  let tokenMint: PublicKey;
  let buyerTokenAccount: PublicKey;
  let sellerTokenAccount: PublicKey;

  const ESCROW_SEED = "escrow";
  const VAULT_SEED = "vault";
  const TOKEN_VAULT_SEED = "token_vault";

  // Helper to derive PDA addresses
  function getEscrowPDA(buyerPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(ESCROW_SEED), buyerPubkey.toBuffer()],
      program.programId
    );
  }

  function getVaultPDA(escrowPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(VAULT_SEED), escrowPubkey.toBuffer()],
      program.programId
    );
  }

  function getTokenVaultPDA(escrowPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(TOKEN_VAULT_SEED), escrowPubkey.toBuffer()],
      program.programId
    );
  }

  async function airdrop(
    pubkey: PublicKey,
    amount: number = 10 * LAMPORTS_PER_SOL
  ) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function getSOLBalance(pubkey: PublicKey): Promise<number> {
    return provider.connection.getBalance(pubkey);
  }

  async function getTokenBalance(tokenAccount: PublicKey): Promise<number> {
    try {
      const account = await getAccount(provider.connection, tokenAccount);
      return Number(account.amount);
    } catch {
      return 0;
    }
  }

  async function getEscrowAccount(escrowPubkey: PublicKey) {
    return program.account.escrow.fetch(escrowPubkey);
  }

  // Helper to build accounts for initialize - includes token accounts only for SPL
  function buildInitializeAccounts(
    buyerPubkey: PublicKey,
    sellerPubkey: PublicKey,
    escrowPDA: PublicKey,
    vaultPDA: PublicKey,
    tokenMint: PublicKey | null,
    buyerTokenAccount: PublicKey | null,
    tokenVault: PublicKey | null
  ): any {
    const accounts: any = {
      buyer: buyerPubkey,
      seller: sellerPubkey,
      escrow: escrowPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenMint: tokenMint,
      tokenVault: tokenVault,
      buyerTokenAccount: buyerTokenAccount,
    };

    // Debug
    console.log("buildInitializeAccounts called with tokenMint:", tokenMint);
    console.log("buildInitializeAccounts returning:", Object.keys(accounts));

    return accounts;
  }

  // Helper to build accounts for release_funds - includes token accounts only for SPL
  function buildReleaseFundsAccounts(
    buyerPubkey: PublicKey,
    sellerPubkey: PublicKey,
    escrowPDA: PublicKey,
    vaultPDA: PublicKey,
    tokenMint: PublicKey | null,
    sellerTokenAccount: PublicKey | null,
    tokenVault: PublicKey | null
  ): any {
    const accounts: any = {
      buyer: buyerPubkey,
      seller: sellerPubkey,
      escrow: escrowPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenMint: tokenMint,
      tokenVault: tokenVault,
      sellerTokenAccount: sellerTokenAccount,
    };

    return accounts;
  }

  // Helper to build accounts for cancel_escrow - includes token accounts only for SPL
  function buildCancelEscrowAccounts(
    buyerPubkey: PublicKey,
    sellerPubkey: PublicKey,
    escrowPDA: PublicKey,
    vaultPDA: PublicKey,
    tokenMint: PublicKey | null,
    buyerTokenAccount: PublicKey | null,
    tokenVault: PublicKey | null
  ): any {
    const accounts: any = {
      buyer: buyerPubkey,
      seller: sellerPubkey,
      escrow: escrowPDA,
      vault: vaultPDA,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenMint: tokenMint,
      tokenVault: tokenVault,
      buyerTokenAccount: buyerTokenAccount,
    };

    return accounts;
  }

  before(async () => {
    // Airdrop SOL to test accounts
    await Promise.all([
      airdrop(buyer.publicKey, 20 * LAMPORTS_PER_SOL),
      airdrop(seller.publicKey, 5 * LAMPORTS_PER_SOL),
      airdrop(unauthorized.publicKey, 5 * LAMPORTS_PER_SOL),
    ]);

    // Create SPL token mint and accounts
    tokenMint = await createMint(
      provider.connection,
      buyer,
      buyer.publicKey,
      null,
      9
    );

    buyerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer,
      tokenMint,
      buyer.publicKey
    );

    sellerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      buyer,
      tokenMint,
      seller.publicKey
    );

    // Mint tokens to buyer
    await mintTo(
      provider.connection,
      buyer,
      tokenMint,
      buyerTokenAccount,
      buyer,
      1_000_000_000 // 1 billion tokens (with 9 decimals)
    );
  });

  // ============================================================
  // TEST 1: SOL Escrow - Initialize
  // ============================================================
  describe("SOL Escrow", () => {
    let escrowPDA: PublicKey;
    let vaultPDA: PublicKey;
    const amount = new BN(1 * LAMPORTS_PER_SOL);
    const agreementHash = Array.from(Buffer.from("a".repeat(32), "hex"));
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour

    before(async () => {
      [escrowPDA] = getEscrowPDA(buyer.publicKey);
      [vaultPDA] = getVaultPDA(escrowPDA);
    });

    it("initialize - creates escrow and deposits SOL", async () => {
      const buyerBalanceBefore = await getSOLBalance(buyer.publicKey);
      const vaultBalanceBefore = await getSOLBalance(vaultPDA);

      const tx = await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      console.log("Initialize SOL escrow tx:", tx);

      // Verify escrow account
      const escrow = await getEscrowAccount(escrowPDA);
      assert.equal(escrow.buyer.toString(), buyer.publicKey.toString());
      assert.equal(escrow.seller.toString(), seller.publicKey.toString());
      assert.equal(escrow.amount.toString(), amount.toString());
      assert.deepEqual(escrow.agreementHash, agreementHash);
      assert.equal(escrow.status, 0); // Pending
      assert.equal(escrow.isSol, true);
      assert.isNull(escrow.tokenMint);
      assert.isNotNull(escrow.expiresAt);

      // Verify balances
      const buyerBalanceAfter = await getSOLBalance(buyer.publicKey);
      const vaultBalanceAfter = await getSOLBalance(vaultPDA);

      assert.equal(
        buyerBalanceAfter,
        buyerBalanceBefore - amount.toNumber() - /* rent */ 0,
        "Buyer SOL should decrease by amount + rent"
      );
      assert.equal(
        vaultBalanceAfter,
        amount.toNumber(),
        "Vault should hold escrow amount"
      );

      console.log("✅ SOL escrow initialized successfully");
    });

    it("approve_delivery - buyer approves delivery", async () => {
      const tx = await program.methods
        .approveDelivery()
        .accounts({
          buyer: buyer.publicKey,
          escrow: escrowPDA,
        })
        .signers([buyer])
        .rpc();

      console.log("Approve delivery tx:", tx);

      const escrow = await getEscrowAccount(escrowPDA);
      assert.equal(escrow.status, 1); // Approved
      console.log("✅ Delivery approved");
    });

    it("release_funds - releases SOL to seller", async () => {
      const sellerBalanceBefore = await getSOLBalance(seller.publicKey);
      const vaultBalanceBefore = await getSOLBalance(vaultPDA);

      const tx = await program.methods
        .releaseFunds()
        .accounts(
          buildReleaseFundsAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // sellerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      console.log("Release funds tx:", tx);

      const escrow = await getEscrowAccount(escrowPDA);
      assert.equal(escrow.status, 2); // Released

      const sellerBalanceAfter = await getSOLBalance(seller.publicKey);
      const vaultBalanceAfter = await getSOLBalance(vaultPDA);

      assert.equal(sellerBalanceAfter, sellerBalanceBefore + amount.toNumber());
      assert.equal(vaultBalanceAfter, 0);

      console.log("✅ SOL funds released to seller");
    });
  });

  // ============================================================
  // TEST 2: SPL Token Escrow - Initialize
  // ============================================================
  describe("SPL Token Escrow", () => {
    let escrowPDA: PublicKey;
    let vaultPDA: PublicKey;
    let tokenVault: PublicKey;
    const amount = new BN(100_000_000); // 100 tokens (9 decimals)
    const agreementHash = Array.from(Buffer.from("b".repeat(32), "hex"));
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

    before(async () => {
      [escrowPDA] = getEscrowPDA(buyer.publicKey);
      [vaultPDA] = getVaultPDA(escrowPDA);
      [tokenVault] = getTokenVaultPDA(escrowPDA);
    });

    it("initialize - creates escrow and deposits SPL tokens", async () => {
      const buyerTokenBalanceBefore = await getTokenBalance(buyerTokenAccount);
      const tokenVaultBalanceBefore = await getTokenBalance(tokenVault);

      const tx = await program.methods
        .initialize(amount, agreementHash, expiresAt, tokenMint)
        .accounts(
          buildInitializeAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            tokenMint,
            buyerTokenAccount,
            tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      console.log("Initialize SPL escrow tx:", tx);

      const escrow = await getEscrowAccount(escrowPDA);
      assert.equal(escrow.buyer.toString(), buyer.publicKey.toString());
      assert.equal(escrow.seller.toString(), seller.publicKey.toString());
      assert.equal(escrow.amount.toString(), amount.toString());
      assert.equal(escrow.status, 0); // Pending
      assert.equal(escrow.isSol, false);
      assert.equal(escrow.tokenMint?.toString(), tokenMint.toString());

      const buyerTokenBalanceAfter = await getTokenBalance(buyerTokenAccount);
      const tokenVaultBalanceAfter = await getTokenBalance(tokenVault);

      assert.equal(
        buyerTokenBalanceAfter,
        buyerTokenBalanceBefore - amount.toNumber()
      );
      assert.equal(tokenVaultBalanceAfter, amount.toNumber());

      console.log("✅ SPL token escrow initialized successfully");
    });

    it("approve_delivery - buyer approves delivery", async () => {
      const tx = await program.methods
        .approveDelivery()
        .accounts({
          buyer: buyer.publicKey,
          escrow: escrowPDA,
        })
        .signers([buyer])
        .rpc();

      console.log("Approve delivery tx:", tx);

      const escrow = await getEscrowAccount(escrowPDA);
      assert.equal(escrow.status, 1); // Approved
      console.log("✅ Delivery approved");
    });

    it("release_funds - releases SPL tokens to seller", async () => {
      const sellerTokenBalanceBefore = await getTokenBalance(
        sellerTokenAccount
      );
      const tokenVaultBalanceBefore = await getTokenBalance(tokenVault);

      const tx = await program.methods
        .releaseFunds()
        .accounts(
          buildReleaseFundsAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            tokenMint,
            sellerTokenAccount,
            tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      console.log("Release funds tx:", tx);

      const escrow = await getEscrowAccount(escrowPDA);
      assert.equal(escrow.status, 2); // Released

      const sellerTokenBalanceAfter = await getTokenBalance(sellerTokenAccount);
      const tokenVaultBalanceAfter = await getTokenBalance(tokenVault);

      assert.equal(
        sellerTokenBalanceAfter,
        sellerTokenBalanceBefore + amount.toNumber()
      );
      assert.equal(tokenVaultBalanceAfter, 0);

      console.log("✅ SPL tokens released to seller");
    });
  });

  // ============================================================
  // TEST 3: Cancel Escrow (Manual)
  // ============================================================
  describe("Cancel Escrow", () => {
    let escrowPDA: PublicKey;
    let vaultPDA: PublicKey;
    let tokenVault: PublicKey;
    const amount = new BN(50_000_000);
    const agreementHash = Array.from(Buffer.from("c".repeat(32), "hex"));
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

    before(async () => {
      [escrowPDA] = getEscrowPDA(unauthorized.publicKey); // New buyer
      [vaultPDA] = getVaultPDA(escrowPDA);
      [tokenVault] = getTokenVaultPDA(escrowPDA);

      // Create token account for unauthorized buyer
      const unauthorizedTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        unauthorized,
        tokenMint,
        unauthorized.publicKey
      );

      // Mint tokens to unauthorized buyer
      await mintTo(
        provider.connection,
        buyer,
        tokenMint,
        unauthorizedTokenAccount,
        buyer,
        1_000_000_000
      );

      // Initialize new escrow
      await program.methods
        .initialize(amount, agreementHash, expiresAt, tokenMint)
        .accounts(
          buildInitializeAccounts(
            unauthorized.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            tokenMint,
            unauthorizedTokenAccount,
            tokenVault
          )
        )
        .signers([unauthorized])
        .rpc();
    });

    it("cancel_escrow - buyer cancels and gets refund", async () => {
      const unauthorizedTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        unauthorized,
        tokenMint,
        unauthorized.publicKey
      );
      const buyerTokenBalanceBefore = await getTokenBalance(unauthorizedTokenAccount);
      const tokenVaultBalanceBefore = await getTokenBalance(tokenVault);

      const tx = await program.methods
        .cancelEscrow()
        .accounts(
          buildCancelEscrowAccounts(
            unauthorized.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            tokenMint,
            unauthorizedTokenAccount,
            tokenVault
          )
        )
        .signers([unauthorized])
        .rpc();

      console.log("Cancel escrow tx:", tx);

      const escrow = await getEscrowAccount(escrowPDA);
      assert.equal(escrow.status, 3); // Cancelled

      const buyerTokenBalanceAfter = await getTokenBalance(unauthorizedTokenAccount);
      const tokenVaultBalanceAfter = await getTokenBalance(tokenVault);

      assert.equal(
        buyerTokenBalanceAfter,
        buyerTokenBalanceBefore + amount.toNumber()
      );
      assert.equal(tokenVaultBalanceAfter, 0);

      console.log("✅ Escrow cancelled, funds refunded to buyer");
    });
  });

  // ============================================================
  // TEST 4: Auto Expiration
  // ============================================================
  describe("Auto Expiration", () => {
    let escrowPDA: PublicKey;
    let vaultPDA: PublicKey;
    const amount = new BN(0.5 * LAMPORTS_PER_SOL);
    const agreementHash = Array.from(Buffer.from("d".repeat(32), "hex"));
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 1); // Expires in 1 second
    const expirationBuyer = Keypair.generate();

    before(async () => {
      // Airdrop SOL to the new buyer
      await airdrop(expirationBuyer.publicKey, 5 * LAMPORTS_PER_SOL);

      [escrowPDA] = getEscrowPDA(expirationBuyer.publicKey);
      [vaultPDA] = getVaultPDA(escrowPDA);

      await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            expirationBuyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([expirationBuyer])
        .rpc();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });

    it("cancel_escrow - anyone can cancel expired escrow", async () => {
      const buyerBalanceBefore = await getSOLBalance(buyer.publicKey);
      const vaultBalanceBefore = await getSOLBalance(vaultPDA);

      const tx = await program.methods
        .cancelEscrow()
        .accounts(
          buildCancelEscrowAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([unauthorized]) // Anyone can call for expired
        .rpc();

      console.log("Cancel expired escrow tx:", tx);

      const escrow = await getEscrowAccount(escrowPDA);
      assert.equal(escrow.status, 4); // Expired

      const buyerBalanceAfter = await getSOLBalance(buyer.publicKey);
      const vaultBalanceAfter = await getSOLBalance(vaultPDA);

      assert.equal(buyerBalanceAfter, buyerBalanceBefore + amount.toNumber());
      assert.equal(vaultBalanceAfter, 0);

      console.log("✅ Expired escrow cancelled, funds refunded");
    });
  });

  // ============================================================
  // TEST 5: Unauthorized Access
  // ============================================================
  describe("Unauthorized Access", () => {
    let escrowPDA: PublicKey;
    let vaultPDA: PublicKey;
    const amount = new BN(1 * LAMPORTS_PER_SOL);
    const agreementHash = Array.from(Buffer.from("e".repeat(32), "hex"));
    const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

    before(async () => {
      const testBuyer = Keypair.generate();
      await airdrop(testBuyer.publicKey, 5 * LAMPORTS_PER_SOL);
      [escrowPDA] = getEscrowPDA(testBuyer.publicKey);
      [vaultPDA] = getVaultPDA(escrowPDA);

      await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            testBuyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([testBuyer])
        .rpc();
    });

    it("approve_delivery - fails if not buyer", async () => {
      try {
        await program.methods
          .approveDelivery()
          .accounts({
            buyer: unauthorized.publicKey, // Wrong buyer
            escrow: escrowPDA,
          })
          .signers([unauthorized])
          .rpc();
        assert.fail("Should have thrown unauthorized error");
      } catch (err: any) {
        assert.include(err.toString(), "Unauthorized");
        console.log("✅ Unauthorized approve_delivery rejected");
      }
    });

    it("release_funds - fails if not approved", async () => {
      try {
        await program.methods
          .releaseFunds()
          .accounts(
            buildReleaseFundsAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // sellerTokenAccount
              null // tokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown invalid state error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidState");
        console.log("✅ Release funds rejected before approval");
      }
    });

    it("cancel_escrow - fails if not buyer (non-expired)", async () => {
      try {
        await program.methods
          .cancelEscrow()
          .accounts(
            buildCancelEscrowAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([unauthorized]) // Not the buyer
          .rpc();
        assert.fail("Should have thrown unauthorized error");
      } catch (err: any) {
        assert.include(err.toString(), "Unauthorized");
        console.log("✅ Unauthorized cancel_escrow rejected");
      }
    });

    it("release_funds - fails if unauthorized tries to release", async () => {
      // First approve as buyer
      await program.methods
        .approveDelivery()
        .accounts({
          buyer: buyer.publicKey,
          escrow: escrowPDA,
        })
        .signers([buyer])
        .rpc();

      try {
        await program.methods
          .releaseFunds()
          .accounts(
            buildReleaseFundsAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // sellerTokenAccount
              null // tokenVault
            )
          )
          .signers([unauthorized]) // Not the buyer
          .rpc();
        assert.fail("Should have thrown unauthorized error");
      } catch (err: any) {
        assert.include(err.toString(), "Unauthorized");
        console.log("✅ Unauthorized release_funds rejected");
      }
    });
  });

  // ============================================================
  // TEST 6: Invalid State Transitions
  // ============================================================
  describe("Invalid State Transitions", () => {
    it("approve_delivery - fails if already approved", async () => {
      const testBuyer = Keypair.generate();
      await airdrop(testBuyer.publicKey, 5 * LAMPORTS_PER_SOL);
      const [escrowPDA] = getEscrowPDA(testBuyer.publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("f".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            testBuyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([testBuyer])
        .rpc();

      await program.methods
        .approveDelivery()
        .accounts({ buyer: testBuyer.publicKey, escrow: escrowPDA })
        .signers([testBuyer])
        .rpc();

      try {
        await program.methods
          .approveDelivery()
          .accounts({ buyer: testBuyer.publicKey, escrow: escrowPDA })
          .signers([testBuyer])
          .rpc();
        assert.fail("Should have thrown invalid state error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidState");
        console.log("✅ Double approve_delivery rejected");
      }
    });

    it("release_funds - fails if already released", async () => {
      const testBuyer = Keypair.generate();
      await airdrop(testBuyer.publicKey, 5 * LAMPORTS_PER_SOL);
      const [escrowPDA] = getEscrowPDA(testBuyer.publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("g".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            testBuyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([testBuyer])
        .rpc();

      await program.methods
        .approveDelivery()
        .accounts({ buyer: testBuyer.publicKey, escrow: escrowPDA })
        .signers([testBuyer])
        .rpc();

      await program.methods
        .releaseFunds()
        .accounts(
          buildReleaseFundsAccounts(
            testBuyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // sellerTokenAccount
            null // tokenVault
          )
        )
        .signers([testBuyer])
        .rpc();

      try {
        await program.methods
          .releaseFunds()
          .accounts(
            buildReleaseFundsAccounts(
              testBuyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // sellerTokenAccount
              null // tokenVault
            )
          )
          .signers([testBuyer])
          .rpc();
        assert.fail("Should have thrown invalid state error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidState");
        console.log("✅ Double release_funds rejected");
      }
    });

    it("cancel_escrow - fails if already cancelled", async () => {
      const testBuyer = Keypair.generate();
      await airdrop(testBuyer.publicKey, 5 * LAMPORTS_PER_SOL);
      const [escrowPDA] = getEscrowPDA(testBuyer.publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("h".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            testBuyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([testBuyer])
        .rpc();

      await program.methods
        .cancelEscrow()
        .accounts(
          buildCancelEscrowAccounts(
            testBuyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([testBuyer])
        .rpc();

      try {
        await program.methods
          .cancelEscrow()
          .accounts(
            buildCancelEscrowAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown invalid state error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidState");
        console.log("✅ Double cancel_escrow rejected");
      }
    });
  });

  // ============================================================
  // TEST 7: PDA Validation
  // ============================================================
  describe("PDA Validation", () => {
    it("initialize - fails with wrong escrow PDA", async () => {
      const fakeBuyer = Keypair.generate();
      const [realEscrowPDA] = getEscrowPDA(buyer.publicKey);
      const [realVaultPDA] = getVaultPDA(realEscrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("i".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      try {
        await program.methods
          .initialize(amount, agreementHash, expiresAt, null)
          .accounts(
            buildInitializeAccounts(
              fakeBuyer.publicKey,
              seller.publicKey,
              realEscrowPDA, // Wrong PDA for this buyer
              realVaultPDA,
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([fakeBuyer])
          .rpc();
        assert.fail("Should have thrown PDA validation error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidSeeds");
        console.log("✅ Wrong escrow PDA rejected");
      }
    });

    it("initialize - fails with wrong vault PDA", async () => {
      const fakeBuyer = Keypair.generate();
      const [escrowPDA] = getEscrowPDA(fakeBuyer.publicKey);
      const [realVaultPDA] = getVaultPDA(escrowPDA);
      const [wrongVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from(VAULT_SEED), Keypair.generate().publicKey.toBuffer()],
        program.programId
      );
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("j".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      try {
        await program.methods
          .initialize(amount, agreementHash, expiresAt, null)
          .accounts(
            buildInitializeAccounts(
              fakeBuyer.publicKey,
              seller.publicKey,
              escrowPDA,
              wrongVaultPDA, // Wrong vault PDA
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([fakeBuyer])
          .rpc();
        assert.fail("Should have thrown PDA validation error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidSeeds");
        console.log("✅ Wrong vault PDA rejected");
      }
    });
  });

  // ============================================================
  // TEST 8: Token Mint Validation
  // ============================================================
  describe("Token Mint Validation", () => {
    let escrowPDA: PublicKey;
    let vaultPDA: PublicKey;
    let tokenVault: PublicKey;
    let wrongMint: PublicKey;

    before(async () => {
      [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      [vaultPDA] = getVaultPDA(escrowPDA);
      [tokenVault] = getTokenVaultPDA(escrowPDA);
      wrongMint = await createMint(
        provider.connection,
        buyer,
        buyer.publicKey,
        null,
        9
      );
    });

    it("initialize - fails if buyer token account mint mismatch", async () => {
      const wrongTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        wrongMint,
        buyer.publicKey
      );
      await mintTo(
        provider.connection,
        buyer,
        wrongMint,
        wrongTokenAccount,
        buyer,
        1_000_000_000
      );

      const amount = new BN(100_000_000);
      const agreementHash = Array.from(Buffer.from("k".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      try {
        await program.methods
          .initialize(amount, agreementHash, expiresAt, tokenMint)
          .accounts(
            buildInitializeAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              tokenMint,
              wrongTokenAccount, // Wrong mint!
              tokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown token mint mismatch error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidTokenMint");
        console.log("✅ Token mint mismatch rejected on initialize");
      }
    });

    it("release_funds - fails if seller token account mint mismatch", async () => {
      // First create a valid escrow
      const [validEscrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [validVaultPDA] = getVaultPDA(validEscrowPDA);
      const [validTokenVault] = getTokenVaultPDA(validEscrowPDA);
      const amount = new BN(100_000_000);
      const agreementHash = Array.from(Buffer.from("l".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      await program.methods
        .initialize(amount, agreementHash, expiresAt, tokenMint)
        .accounts(
          buildInitializeAccounts(
            buyer.publicKey,
            seller.publicKey,
            validEscrowPDA,
            validVaultPDA,
            tokenMint,
            buyerTokenAccount,
            validTokenVault
          )
        )
        .signers([buyer])
        .rpc();

      await program.methods
        .approveDelivery()
        .accounts({ buyer: buyer.publicKey, escrow: validEscrowPDA })
        .signers([buyer])
        .rpc();

      // Now try to release with wrong seller token account
      const wrongSellerTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        wrongMint,
        seller.publicKey
      );

      try {
        await program.methods
          .releaseFunds()
          .accounts(
            buildReleaseFundsAccounts(
              buyer.publicKey,
              seller.publicKey,
              validEscrowPDA,
              validVaultPDA,
              tokenMint,
              wrongSellerTokenAccount, // Wrong mint!
              validTokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown token mint mismatch error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidTokenMint");
        console.log("✅ Token mint mismatch rejected on release_funds");
      }
    });
  });

  // ============================================================
  // TEST 9: Balance Verification Before/After
  // ============================================================
  describe("Balance Verification", () => {
    it("tracks SOL balances correctly through full lifecycle", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(2 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("m".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      // Initial balances
      const buyerInitial = await getSOLBalance(buyer.publicKey);
      const sellerInitial = await getSOLBalance(seller.publicKey);
      const vaultInitial = await getSOLBalance(vaultPDA);

      // Initialize
      await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      const buyerAfterInit = await getSOLBalance(buyer.publicKey);
      const vaultAfterInit = await getSOLBalance(vaultPDA);
      assert.equal(vaultAfterInit, amount.toNumber());
      assert.isBelow(buyerAfterInit, buyerInitial);

      // Approve
      await program.methods
        .approveDelivery()
        .accounts({ buyer: buyer.publicKey, escrow: escrowPDA })
        .signers([buyer])
        .rpc();

      // Release
      await program.methods
        .releaseFunds()
        .accounts(
          buildReleaseFundsAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // sellerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      const sellerFinal = await getSOLBalance(seller.publicKey);
      const vaultFinal = await getSOLBalance(vaultPDA);

      assert.equal(sellerFinal, sellerInitial + amount.toNumber());
      assert.equal(vaultFinal, 0);

      console.log("✅ SOL balances verified throughout lifecycle");
    });

    it("tracks SPL token balances correctly through full lifecycle", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const [tokenVault] = getTokenVaultPDA(escrowPDA);
      const amount = new BN(200_000_000);
      const agreementHash = Array.from(Buffer.from("n".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      // Initial balances
      const buyerInitial = await getTokenBalance(buyerTokenAccount);
      const sellerInitial = await getTokenBalance(sellerTokenAccount);
      const vaultInitial = await getTokenBalance(tokenVault);

      // Initialize
      await program.methods
        .initialize(amount, agreementHash, expiresAt, tokenMint)
        .accounts(
          buildInitializeAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            tokenMint,
            buyerTokenAccount,
            tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      const buyerAfterInit = await getTokenBalance(buyerTokenAccount);
      const vaultAfterInit = await getTokenBalance(tokenVault);
      assert.equal(vaultAfterInit, amount.toNumber());
      assert.equal(buyerAfterInit, buyerInitial - amount.toNumber());

      // Approve
      await program.methods
        .approveDelivery()
        .accounts({ buyer: buyer.publicKey, escrow: escrowPDA })
        .signers([buyer])
        .rpc();

      // Release
      await program.methods
        .releaseFunds()
        .accounts(
          buildReleaseFundsAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            tokenMint,
            sellerTokenAccount,
            tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      const sellerFinal = await getTokenBalance(sellerTokenAccount);
      const vaultFinal = await getTokenBalance(tokenVault);

      assert.equal(sellerFinal, sellerInitial + amount.toNumber());
      assert.equal(vaultFinal, 0);

      console.log("✅ SPL token balances verified throughout lifecycle");
    });
  });

  // ============================================================
  // TEST 10: Replay Protection
  // ============================================================
  describe("Replay Protection", () => {
    it("cannot replay approve_delivery after release", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("o".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      await program.methods
        .approveDelivery()
        .accounts({ buyer: buyer.publicKey, escrow: escrowPDA })
        .signers([buyer])
        .rpc();

      await program.methods
        .releaseFunds()
        .accounts(
          buildReleaseFundsAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // sellerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      // Try to approve again after release
      try {
        await program.methods
          .approveDelivery()
          .accounts({ buyer: buyer.publicKey, escrow: escrowPDA })
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown invalid state error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidState");
        console.log("✅ Replay approve_delivery after release rejected");
      }
    });

    it("cannot replay cancel_escrow after release", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("p".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      await program.methods
        .approveDelivery()
        .accounts({ buyer: buyer.publicKey, escrow: escrowPDA })
        .signers([buyer])
        .rpc();

      await program.methods
        .releaseFunds()
        .accounts(
          buildReleaseFundsAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // sellerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      // Try to cancel after release
      try {
        await program.methods
          .cancelEscrow()
          .accounts(
            buildCancelEscrowAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown invalid state error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidState");
        console.log("✅ Replay cancel_escrow after release rejected");
      }
    });
  });

  // ============================================================
  // TEST 11: Edge Cases - Amount Validation
  // ============================================================
  describe("Amount Validation", () => {
    it("initialize - fails with zero amount", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(0);
      const agreementHash = Array.from(Buffer.from("q".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      try {
        await program.methods
          .initialize(amount, agreementHash, expiresAt, null)
          .accounts(
            buildInitializeAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown invalid amount error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidAmount");
        console.log("✅ Zero amount rejected");
      }
    });

    it("initialize - fails with amount too large", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = U64_MAX;
      const agreementHash = Array.from(Buffer.from("r".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 3600);

      try {
        await program.methods
          .initialize(amount, agreementHash, expiresAt, null)
          .accounts(
            buildInitializeAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown invalid amount error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidAmount");
        console.log("✅ Max u64 amount rejected");
      }
    });
  });

  // ============================================================
  // TEST 12: Edge Cases - Expiration Validation
  // ============================================================
  describe("Expiration Validation", () => {
    it("initialize - fails with expiration too soon", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("s".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 30); // 30 seconds (less than 1 min)

      try {
        await program.methods
          .initialize(amount, agreementHash, expiresAt, null)
          .accounts(
            buildInitializeAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown invalid expiration error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidExpiration");
        console.log("✅ Expiration too soon rejected");
      }
    });

    it("initialize - fails with expiration too far", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("t".repeat(32), "hex"));
      const expiresAt = new BN(Math.floor(Date.now() / 1000) + 366 * 24 * 3600); // > 1 year

      try {
        await program.methods
          .initialize(amount, agreementHash, expiresAt, null)
          .accounts(
            buildInitializeAccounts(
              buyer.publicKey,
              seller.publicKey,
              escrowPDA,
              vaultPDA,
              null, // tokenMint
              null, // buyerTokenAccount
              null // tokenVault
            )
          )
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown invalid expiration error");
      } catch (err: any) {
        assert.include(err.toString(), "InvalidExpiration");
        console.log("✅ Expiration too far rejected");
      }
    });

    it("initialize - succeeds with no expiration", async () => {
      const [escrowPDA] = getEscrowPDA(Keypair.generate().publicKey);
      const [vaultPDA] = getVaultPDA(escrowPDA);
      const amount = new BN(1 * LAMPORTS_PER_SOL);
      const agreementHash = Array.from(Buffer.from("u".repeat(32), "hex"));
      const expiresAt = null;

      const tx = await program.methods
        .initialize(amount, agreementHash, expiresAt, null)
        .accounts(
          buildInitializeAccounts(
            buyer.publicKey,
            seller.publicKey,
            escrowPDA,
            vaultPDA,
            null, // tokenMint
            null, // buyerTokenAccount
            null // tokenVault
          )
        )
        .signers([buyer])
        .rpc();

      const escrow = await getEscrowAccount(escrowPDA);
      assert.isNull(escrow.expiresAt);
      console.log("✅ No expiration accepted");
    });
  });
});

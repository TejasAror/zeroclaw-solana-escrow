/**
 * ZeroClaw Telegram Bot Entry Point
 * 
 * Registers commands for the ZeroClaw AI-to-AI escrow workflow:
 * - /start, /help - Bot information and usage
 * - /negotiate - Negotiate contract between buyer and seller
 * - /escrow - Create on-chain escrow from negotiated agreement
 * - /verify - Verify delivery and approve delivery
 * - /settle - Settle escrow (release funds or cancel)
 * - /status - Check escrow status
 */
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { spawn } = require('child_process');
const fs = require('fs');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.PROGRAM_ID || '8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in .env');
  process.exit(1);
}

// Working directory for ZeroClaw skills
const ZEROCLAW_ROOT = path.resolve(__dirname, '../zeroclaw');
const SKILLS_DIR = path.join(ZEROCLAW_ROOT, 'skills');
const MEMORY_DIR = path.join(ZEROCLAW_ROOT, 'memory');

// Conversation state storage
const userSessions = new Map();

// Utility: Run a Python skill and return parsed JSON
function runSkill(skillName, inputData) {
  return new Promise((resolve, reject) => {
    const skillPath = path.join(SKILLS_DIR, skillName, `${skillName}.py`);
    const inputFile = path.join(ZEROCLAW_ROOT, `${skillName}_input_${Date.now()}.json`);

    console.log("ZEROCLAW_ROOT =", ZEROCLAW_ROOT);
console.log("SKILL PATH =", skillPath);
console.log("INPUT FILE =", inputFile);
    
    fs.writeFileSync(inputFile, JSON.stringify(inputData, null, 2));

    
    
    const python = spawn(
  'C:\\Users\\Tejas\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
  [skillPath, inputFile],
  {
      cwd: ZEROCLAW_ROOT,
      timeout: 180000 // 3 minutes
    });
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', (code) => {
      // Clean up temp input file
      try { fs.unlinkSync(inputFile); } catch {}
      
      if (code !== 0) {
        reject(new Error(`Skill ${skillName} exited with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse skill output: ${stdout}`));
      }
    });
    
    python.on('error', (err) => {
      reject(new Error(`Failed to spawn skill: ${err.message}`));
    });
  });
}

// Utility: Format escrow info for Telegram
function formatEscrowInfo(escrow) {
  let msg = `📋 *Escrow Details*\n`;
  msg += `🔑 Escrow PDA: \`${escrow.escrow_pda || escrow.escrow_address || 'N/A'}\`\n`;
  msg += `👤 Buyer: \`${escrow.buyer || 'N/A'}\`\n`;
  msg += `👤 Seller: \`${escrow.seller || 'N/A'}\`\n`;
  msg += `💰 Amount: ${escrow.amount ? (escrow.amount / 1e9).toFixed(9) + ' SOL' : 'N/A'}\n`;
  msg += `📊 Status: ${escrow.escrow_status || escrow.settlement_status || 'Unknown'}\n`;
  if (escrow.transaction_signature) {
    msg += `📝 Tx Signature: \`${escrow.transaction_signature}\`\n`;
    msg += `🔗 [View on Solana Explorer](https://explorer.solana.com/tx/${escrow.transaction_signature}?cluster=devnet)\n`;
  }
  if (escrow.escrow_pda || escrow.escrow_address) {
    const addr = escrow.escrow_pda || escrow.escrow_address;
    msg += `🔗 [Escrow on Explorer](https://explorer.solana.com/address/${addr}?cluster=devnet)\n`;
  }
  if (escrow.vault_address) {
    msg += `🏦 Vault: \`${escrow.vault_address}\`\n`;
  }
  return msg;
}

// Utility: Format agreement for Telegram
function formatAgreement(agreement) {
  let msg = `📄 *Negotiated Agreement*\n`;
  msg += `🆔 Negotiation ID: \`${agreement.negotiation_id}\`\n`;
  msg += `💰 Price: ${agreement.price ? (agreement.price / 1e9).toFixed(9) + ' SOL' : 'N/A'}\n`;
  msg += `📦 Asset: ${agreement.asset || 'N/A'}\n`;
  msg += `👤 Buyer: \`${agreement.buyer || 'N/A'}\`\n`;
  msg += `👤 Seller: \`${agreement.seller || 'N/A'}\`\n`;
  msg += `#️⃣ Hash: \`${agreement.agreement_hash || 'N/A'}\`\n`;
  return msg;
}

// Create bot
const bot = new Telegraf(BOT_TOKEN);

// Logging middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  console.log(`📨 ${ctx.from?.username || ctx.from?.id} (${ctx.chat.id}): ${ctx.message?.text || ctx.callbackQuery?.data}`);
  try {
    await next();
  } catch (err) {
    console.error('❌ Error:', err);
    await ctx.reply('❌ An error occurred. Please try again.');
  }
  console.log(`⏱️  Processed in ${Date.now() - start}ms`);
});

// /start command
bot.start(async (ctx) => {
  const welcome = `
🤖 *Welcome to ZeroClaw Escrow Bot*

ZeroClaw enables autonomous AI-to-AI commerce with on-chain escrow on Solana Devnet.

*Available Commands:*
/negotiate - Negotiate a contract between buyer and seller
/escrow - Create on-chain escrow from negotiated agreement
/verify - Verify delivery and approve delivery
/settle - Settle escrow (release funds or cancel)
/status - Check escrow/agreement status
/help - Show this help message

*Workflow:*
1. 🤝 \`/negotiate\` - Agree on terms (price, delivery, deadlines)
2. 🔐 \`/escrow\` - Create escrow with human approval
3. ✅ \`/verify\` - Verify delivery + buyer approval
4. 💸 \`/settle\` - Release funds to seller

*Network:* Solana Devnet
*Program:* \`${PROGRAM_ID}\`

Type /help for detailed usage.
  `;
  await ctx.replyWithMarkdown(welcome);
});

// /help command
bot.help(async (ctx) => {
  const help = `
📚 *ZeroClaw Bot - Detailed Help*

*/negotiate*
Start a new negotiation. You'll be guided through:
- Buyer request (asset, max price, delivery requirements)
- Seller offer (asset, min price, delivery capabilities)
- Automatic agreement generation with SHA-256 hash

*/escrow*
Create on-chain escrow from a negotiated agreement.
Requires:
- Existing negotiation_id
- Human approval confirmation
- Buyer keypair (for signing)

*/verify*
Verify delivery completion:
- Provide delivery evidence (method, verification type, timestamp)
- Request buyer approval (required by default)
- Calls approveDelivery() on-chain

*/settle*
Settle the escrow:
- If approved → releaseFunds() to seller
- If expired/cancelled → cancelEscrow() refund buyer
- Prevents duplicate settlements

*/status*
Check current status:
- Negotiation ID or Escrow PDA
- Shows agreement, escrow state, transaction links

*Human Approval Flow:*
All on-chain transactions require explicit human approval via Telegram before execution.

*Example Workflow:*
1. /negotiate → creates negotiation_123
2. /escrow negotiation_123 → creates escrow, requires approval
3. /verify negotiation_123 → submit evidence, request buyer approval
4. /settle escrow_123 → releases funds to seller
  `;
  await ctx.reply(help);
});

// Conversation state helpers
function getSession(chatId) {
  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, { step: 'idle', data: {} });
  }
  return userSessions.get(chatId);
}

function setStep(chatId, step, data = {}) {
  const session = getSession(chatId);
  session.step = step;
  session.data = { ...session.data, ...data };
}

function clearSession(chatId) {
  userSessions.delete(chatId);
}

// ==================== /negotiate conversation ====================
bot.command('negotiate', async (ctx) => {
  const chatId = ctx.chat.id;
  setStep(chatId, 'negotiate_buyer_asset');
  
  await ctx.replyWithMarkdown(
    `🤝 *New Negotiation*\n\n` +
    `Step 1/8: What asset is the buyer requesting?\n` +
    `Example: \`gpu-a100-1h\` or \`compute-1h\``
  );
});

bot.hears(/.*/, async (ctx) => {
  const chatId = ctx.chat.id;
  const session = getSession(chatId);
  const text = ctx.message.text.trim();
  
  if (session.step === 'idle' || !session.step.startsWith('negotiate_')) return;
  
  try {
    switch (session.step) {
      case 'negotiate_buyer_asset':
        session.data.buyer_asset = text;
        setStep(chatId, 'negotiate_buyer_max_price');
        await ctx.reply('Step 2/8: Buyer max price (in lamports, 1 SOL = 1,000,000,000 lamports)?\nExample: `100000000`');
        break;
        
      case 'negotiate_buyer_max_price':
        session.data.buyer_max_price = parseInt(text);
        setStep(chatId, 'negotiate_seller_min_price');
        await ctx.reply('Step 3/8: Seller min price (in lamports)?\nExample: `100000000`');
        break;
        
      case 'negotiate_seller_min_price':
        session.data.seller_min_price = parseInt(text);
        setStep(chatId, 'negotiate_asset_type');
        await ctx.reply('Step 4/8: Asset type?\nExample: `compute`');
        break;
        
      case 'negotiate_asset_type':
        session.data.asset_type = text;
        setStep(chatId, 'negotiate_payment_token');
        await ctx.reply('Step 5/8: Payment token? (Currently only SOL supported)\nExample: `SOL`');
        break;
        
      case 'negotiate_payment_token':
        session.data.payment_token = text;
        setStep(chatId, 'negotiate_delivery_method');
        await ctx.reply('Step 6/8: Delivery method?\nExample: `api`');
        break;
        
      case 'negotiate_delivery_method':
        session.data.delivery_method = text;
        setStep(chatId, 'negotiate_verification');
        await ctx.reply('Step 7/8: Verification method? (automatic/manual/zk_proof)\nExample: `automatic`');
        break;
        
      case 'negotiate_verification':
        session.data.verification = text;
        setStep(chatId, 'negotiate_deadline');
        await ctx.reply('Step 8/8: Delivery deadline (Unix timestamp)?\nExample: `1800000000`');
        break;
        
      case 'negotiate_deadline':
        session.data.deadline = parseInt(text);
        
        // Generate negotiation_id
        const negotiationId = `neg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        session.data.negotiation_id = negotiationId;
        
        // Build buyer_request and seller_offer
        const now = Math.floor(Date.now() / 1000);
        const expiration = session.data.deadline + 86400; // +1 day buffer
        
        const buyerRequest = {
          buyer: `DcX5q52VJeRpZZfoX4fk6sqGpxGsQkAFCWuTJyg5WY3X`, // Demo buyer
          asset: session.data.buyer_asset,
          max_price: session.data.buyer_max_price,
          asset_type: session.data.asset_type,
          delivery_requirements: {
            method: session.data.delivery_method,
            deadline: session.data.deadline,
            verification: session.data.verification,
            details: `Delivery via ${session.data.delivery_method}`,
            required_by: session.data.deadline,
            available_by: session.data.deadline
          },
          payment_token: session.data.payment_token,
          deadlines: {
            delivery: session.data.deadline,
            payment: session.data.deadline,
            dispute_window: session.data.deadline,
            expiration: expiration
          },
          cancellation_policy: {
            buyer_can_cancel: true,
            seller_can_cancel: true,
            cancellation_window_seconds: 3600,
            refund_policy: "full",
            penalty_basis_points: 0
          },
          settlement_conditions: {
            auto_release_on_delivery: true,
            require_buyer_confirmation: true,
            dispute_resolution: "mutual",
            preimage_reveal_required: false
          },
          marketplace_id: "finality-marketplace-v1",
          negotiation_id: negotiationId
        };
        
        const sellerOffer = {
          seller: `2ve5JujWUeuVB2NsHagMHhcS9H9HYyiDis9gUgsMwh2m`, // Demo seller
          asset: session.data.buyer_asset,
          min_price: session.data.seller_min_price,
          asset_type: session.data.asset_type,
          delivery_requirements: {
            method: session.data.delivery_method,
            deadline: session.data.deadline,
            verification: session.data.verification,
            details: `Delivery via ${session.data.delivery_method}`,
            required_by: session.data.deadline,
            available_by: session.data.deadline
          },
          payment_token: session.data.payment_token,
          deadlines: {
            delivery: session.data.deadline,
            payment: session.data.deadline,
            dispute_window: session.data.deadline,
            expiration: expiration
          },
          cancellation_policy: {
            buyer_can_cancel: true,
            seller_can_cancel: true,
            cancellation_window_seconds: 3600,
            refund_policy: "full",
            penalty_basis_points: 0
          },
          settlement_conditions: {
            auto_release_on_delivery: true,
            require_buyer_confirmation: true,
            dispute_resolution: "mutual",
            preimage_reveal_required: false
          },
          marketplace_id: "finality-marketplace-v1",
          negotiation_id: negotiationId
        };
        
        await ctx.reply('⏳ Negotiating contract...');
        
        try {
          const result = await runSkill('negotiate_contract', {
            buyer_request: buyerRequest,
            seller_offer: sellerOffer
          });
          
          if (result.status === 'success') {
            clearSession(chatId);
            
            let msg = `✅ *Negotiation Complete!*\n\n`;
            msg += formatAgreement(result.agreement);
            msg += `\n💾 Stored in memory with ID: \`${negotiationId}\``;
            msg += `\n\nNext step: \`/escrow ${negotiationId}\``;
            
            await ctx.replyWithMarkdown(msg);
          } else {
            await ctx.reply(`❌ Negotiation failed: ${result.error_message}`);
          }
        } catch (err) {
          await ctx.reply(`❌ Error: ${err.message}`);
        }
        break;
    }
  } catch (err) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

// ==================== /escrow command ====================
bot.command('escrow', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const chatId = ctx.chat.id;
  
  if (args.length === 0) {
    setStep(chatId, 'escrow_negotiation_id');
    await ctx.reply('🔐 *Create Escrow*\n\nProvide the negotiation ID from /negotiate:\nExample: `/escrow neg_123456789_abc`', { parse_mode: 'Markdown' });
    return;
  }
  
  const negotiationId = args[0];
  
  // Check if negotiation exists in memory
  const negotiationPath = path.join(MEMORY_DIR, 'negotiations', `${negotiationId}.json`);
  if (!fs.existsSync(negotiationPath)) {
    await ctx.reply(`❌ Negotiation \`${negotiationId}\` not found in memory.`, { parse_mode: 'Markdown' });
    return;
  }
  
  const negotiation = JSON.parse(fs.readFileSync(negotiationPath, 'utf8'));
  const agreement = negotiation.agreement;
  const agreementHash = negotiation.agreement_hash;
  
  // Request human approval
  setStep(chatId, 'escrow_approval', { negotiationId, agreement, agreementHash });
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Approve & Create Escrow', `escrow_approve_${negotiationId}`)],
    [Markup.button.callback('❌ Cancel', 'escrow_cancel')]
  ]);
  
  let msg = `🔐 *Create Escrow Confirmation*\n\n`;
  msg += formatAgreement(agreement);
  msg += `\n\n⚠️ *Human approval required before on-chain transaction*`;
  msg += `\n\nDo you approve creating this escrow on Solana Devnet?`;
  
  await ctx.replyWithMarkdown(msg, keyboard);
});

bot.action(/escrow_approve_(.+)/, async (ctx) => {
  const negotiationId = ctx.match[1];
  const chatId = ctx.chat.id;
  const session = getSession(chatId);
  
  if (!session.data.agreement || session.data.negotiationId !== negotiationId) {
    await ctx.answerCbQuery('❌ Session expired. Restart with /escrow');
    return;
  }
  
  await ctx.answerCbQuery('⏳ Creating escrow...');
  await ctx.editMessageText('⏳ Creating escrow on Devnet...', { parse_mode: 'Markdown' });
  
  const { agreement, agreementHash } = session.data;
  
  try {
    const result = await runSkill('create_escrow', {
      agreement,
      agreement_hash: agreementHash,
      human_approval: {
        approved: true,
        approver: `telegram_${ctx.from.id}`,
        timestamp: Math.floor(Date.now() / 1000),
        signature: `telegram_approval_${Date.now()}`
      },
      buyer_keypair: {
        publicKey: agreement.buyer,
        secretKey: Array(64).fill(0).map((_, i) => i % 256) // Demo keypair - in production load from secure storage
      },
      cluster: 'devnet',
      rpc_url: SOLANA_RPC,
      compute_budget: { units: 200000, price: 1000 }
    });
    
    clearSession(chatId);
    
    if (result.success) {
      let msg = `✅ *Escrow Created Successfully!*\n\n`;
      msg += formatEscrowInfo(result);
      msg += `\n💾 Stored in memory with negotiation ID: \`${negotiationId}\``;
      msg += `\n\nNext step: \`/verify ${negotiationId}\``;
      
      await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
    } else {
      await ctx.editMessageText(`❌ Escrow creation failed: ${result.error_message}`, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    await ctx.editMessageText(`❌ Error: ${err.message}`, { parse_mode: 'Markdown' });
  }
});

bot.action('escrow_cancel', async (ctx) => {
  clearSession(ctx.chat.id);
  await ctx.editMessageText('❌ Escrow creation cancelled.', { parse_mode: 'Markdown' });
});

// ==================== /verify command ====================
bot.command('verify', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const chatId = ctx.chat.id;
  
  if (args.length === 0) {
    setStep(chatId, 'verify_negotiation_id');
    await ctx.reply('✅ *Verify Delivery*\n\nProvide the negotiation ID:\nExample: `/verify neg_123456789_abc`', { parse_mode: 'Markdown' });
    return;
  }
  
  const negotiationId = args[0];
  
  // Check if escrow exists in memory
  const escrowPath = path.join(MEMORY_DIR, 'escrows', `${negotiationId}.json`);
  if (!fs.existsSync(escrowPath)) {
    await ctx.reply(`❌ Escrow for \`${negotiationId}\` not found. Create escrow first with /escrow.`, { parse_mode: 'Markdown' });
    return;
  }
  
  setStep(chatId, 'verify_delivery_method', { negotiationId });
  
  await ctx.replyWithMarkdown(
    `✅ *Verify Delivery for ${negotiationId}*\n\n` +
    `Step 1/4: How was delivery completed?\n` +
    `Example: \`api\``
  );
});

bot.hears(/.*/, async (ctx) => {
  const chatId = ctx.chat.id;
  const session = getSession(chatId);
  const text = ctx.message.text.trim();
  
  if (!session.step.startsWith('verify_')) return;
  
  try {
    switch (session.step) {
      case 'verify_delivery_method':
        session.data.delivery_method = text;
        setStep(chatId, 'verify_verification_method', session.data);
        await ctx.reply('Step 2/4: Verification method? (automatic/manual/zk_proof)\nExample: `automatic`');
        break;
        
      case 'verify_verification_method':
        session.data.verification_method = text;
        setStep(chatId, 'verify_submitted_at', session.data);
        await ctx.reply('Step 3/4: Submission timestamp (Unix timestamp)?\nExample: `1800000000`');
        break;
        
      case 'verify_submitted_at':
        session.data.submitted_at = parseInt(text);
        setStep(chatId, 'verify_proof', session.data);
        await ctx.reply('Step 4/4: Proof hash or verifier info? (Required for automatic/zk_proof)\nExample: `proof_hash_abc123`');
        break;
        
      case 'verify_proof':
        session.data.proof_hash = text;
        
        // Build delivery evidence
        const deliveryEvidence = {
          method: session.data.delivery_method,
          verification: session.data.verification_method,
          submitted_at: session.data.submitted_at,
          proof_hash: session.data.proof_hash
        };
        
        // Request buyer approval
        setStep(chatId, 'verify_buyer_approval', { ...session.data, negotiationId: session.data.negotiationId });
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('✅ Approve Delivery', `verify_approve_${session.data.negotiationId}`)],
          [Markup.button.callback('❌ Reject', `verify_reject_${session.data.negotiationId}`)]
        ]);
        
        await ctx.replyWithMarkdown(
          `📋 *Delivery Evidence Submitted*\n\n` +
          `Method: ${deliveryEvidence.method}\n` +
          `Verification: ${deliveryEvidence.verification}\n` +
          `Submitted: ${new Date(deliveryEvidence.submitted_at * 1000).toISOString()}\n` +
          `Proof: ${deliveryEvidence.proof_hash}\n\n` +
          `⚠️ *Buyer approval required* - Approve delivery?`,
          keyboard
        );
        break;
        
      case 'verify_buyer_approval':
        // Handled via inline buttons
        break;
    }
  } catch (err) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
});

bot.action(/verify_approve_(.+)/, async (ctx) => {
  const negotiationId = ctx.match[1];
  const chatId = ctx.chat.id;
  const session = getSession(chatId);
  
  await ctx.answerCbQuery('⏳ Verifying delivery...');
  await ctx.editMessageText('⏳ Verifying delivery on-chain...', { parse_mode: 'Markdown' });
  
  try {
    const result = await runSkill('verify_delivery', {
      negotiation_id: negotiationId,
      delivery_evidence: {
        method: session.data.delivery_method,
        verification: session.data.verification_method,
        submitted_at: session.data.submitted_at,
        proof_hash: session.data.proof_hash
      },
      buyer_confirmation: {
        approved: true,
        approved_at: Math.floor(Date.now() / 1000),
        buyer_signature: `telegram_buyer_approval_${Date.now()}`,
        notes: "Approved via Telegram bot"
      },
      force_verification: false,
      buyer_keypair_path: "/tmp/test_buyer_keypair.json" // Demo path
    });
    
    clearSession(chatId);
    
    if (result.status === 'success') {
      let msg = `✅ *Delivery Verified & Approved!*\n\n`;
      msg += `📝 Transaction: \`${result.transaction?.signature || 'N/A'}\`\n`;
      if (result.transaction?.signature) {
        msg += `🔗 [View on Explorer](https://explorer.solana.com/tx/${result.transaction.signature}?cluster=devnet)\n`;
      }
      msg += `📊 New Status: ${result.escrow_status}\n\n`;
      msg += `Next step: \`/settle ${negotiationId}\``;
      
      await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
    } else {
      await ctx.editMessageText(`❌ Verification failed: ${result.error_message}`, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    await ctx.editMessageText(`❌ Error: ${err.message}`, { parse_mode: 'Markdown' });
  }
});

bot.action(/verify_reject_(.+)/, async (ctx) => {
  clearSession(ctx.chat.id);
  await ctx.editMessageText('❌ Delivery verification rejected by buyer.', { parse_mode: 'Markdown' });
});

// ==================== /settle command ====================
bot.command('settle', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const chatId = ctx.chat.id;
  
  if (args.length === 0) {
    setStep(chatId, 'settle_escrow_id');
    await ctx.reply('💸 *Settle Escrow*\n\nProvide the negotiation/escrow ID:\nExample: `/settle neg_123456789_abc`', { parse_mode: 'Markdown' });
    return;
  }
  
  const escrowId = args[0];
  
  // Check escrow exists
  const escrowPath = path.join(MEMORY_DIR, 'escrows', `${escrowId}.json`);
  if (!fs.existsSync(escrowPath)) {
    await ctx.reply(`❌ Escrow \`${escrowId}\` not found.`, { parse_mode: 'Markdown' });
    return;
  }
  
  const escrow = JSON.parse(fs.readFileSync(escrowPath, 'utf8'));
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💸 Release Funds (release)', `settle_release_${escrowId}`)],
    [Markup.button.callback('❌ Cancel Escrow (cancel)', `settle_cancel_${escrowId}`)],
    [Markup.button.callback('🔍 Check Status Only', `settle_status_${escrowId}`)]
  ]);
  
  let msg = `💸 *Settle Escrow: ${escrowId}*\n\n`;
  msg += formatEscrowInfo(escrow);
  msg += `\n\nChoose settlement action:`;
  
  await ctx.replyWithMarkdown(msg, keyboard);
});

bot.action(/settle_(release|cancel|status)_(.+)/, async (ctx) => {
  const action = ctx.match[1];
  const escrowId = ctx.match[2];
  const chatId = ctx.chat.id;
  
  await ctx.answerCbQuery(`⏳ ${action}ing...`);
  await ctx.editMessageText(`⏳ ${action === 'status' ? 'Checking' : action}ing escrow...`, { parse_mode: 'Markdown' });
  
  try {
    const forceAction = action === 'release' ? 'release' : action === 'cancel' ? 'cancel' : null;
    
    const result = await runSkill('settle_escrow', {
      escrow_id: escrowId,
      buyer_keypair_path: "/tmp/test_buyer_keypair.json", // Demo path
      force_action: forceAction
    });
    
    if (result.success || action === 'status') {
      let msg = `${action === 'status' ? '📊' : '✅'} *Escrow ${action === 'release' ? 'Released' : action === 'cancel' ? 'Cancelled' : 'Status'}*\n\n`;
      
      if (result.transaction_signature) {
        msg += `📝 Transaction: \`${result.transaction_signature}\`\n`;
        msg += `🔗 [View on Explorer](https://explorer.solana.com/tx/${result.transaction_signature}?cluster=devnet)\n`;
      }
      msg += `📊 Status: ${result.settlement_status || result.on_chain_status_before}\n`;
      msg += `💰 Action: ${result.action || 'status_check'}\n`;
      
      await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
    } else {
      await ctx.editMessageText(`❌ ${action} failed: ${result.message || result.error}`, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    await ctx.editMessageText(`❌ Error: ${err.message}`, { parse_mode: 'Markdown' });
  }
});

// ==================== /status command ====================
bot.command('status', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  
  if (args.length === 0) {
    await ctx.reply('📊 *Check Status*\n\nProvide negotiation ID or escrow PDA:\nExample: `/status neg_123456789_abc`', { parse_mode: 'Markdown' });
    return;
  }
  
  const query = args[0];
  let found = false;
  
  // Check negotiations
  const negPath = path.join(MEMORY_DIR, 'negotiations', `${query}.json`);
  if (fs.existsSync(negPath)) {
    const neg = JSON.parse(fs.readFileSync(negPath, 'utf8'));
    let msg = `📊 *Negotiation Status: ${query}*\n\n`;
    msg += formatAgreement(neg.agreement);
    msg += `\n💾 Status: ${neg.status}`;
    msg += `\n🕐 Created: ${neg.created_at}`;
    await ctx.replyWithMarkdown(msg);
    found = true;
  }
  
  // Check escrows
  const escrowPath = path.join(MEMORY_DIR, 'escrows', `${query}.json`);
  if (fs.existsSync(escrowPath)) {
    const escrow = JSON.parse(fs.readFileSync(escrowPath, 'utf8'));
    let msg = `📊 *Escrow Status: ${query}*\n\n`;
    msg += formatEscrowInfo(escrow);
    msg += `\n💾 Settlement Status: ${escrow.settlement_status || 'pending'}`;
    if (escrow.verification_timestamp) {
      msg += `\n✅ Verified: ${new Date(escrow.verification_timestamp * 1000).toISOString()}`;
    }
    await ctx.replyWithMarkdown(msg);
    found = true;
  }
  
  // Check settlements
  const settlementDir = path.join(MEMORY_DIR, 'settlements');
  if (fs.existsSync(settlementDir)) {
    const files = fs.readdirSync(settlementDir);
    for (const file of files) {
      if (file.includes(query)) {
        const settlement = JSON.parse(fs.readFileSync(path.join(settlementDir, file), 'utf8'));
        let msg = `📊 *Settlement Record*\n\n`;
        msg += `🆔 Settlement ID: \`${settlement.settlement_id}\`\n`;
        msg += `🔑 Escrow: \`${settlement.escrow_address}\`\n`;
        msg += `⚡ Action: ${settlement.action}\n`;
        msg += `📊 Final Status: ${settlement.final_escrow_status}\n`;
        if (settlement.transaction_signature) {
          msg += `📝 Transaction: \`${settlement.transaction_signature}\`\n`;
          msg += `🔗 [View on Explorer](https://explorer.solana.com/tx/${settlement.transaction_signature}?cluster=devnet)\n`;
        }
        msg += `🕐 Timestamp: ${settlement.settlement_timestamp_iso}`;
        await ctx.replyWithMarkdown(msg);
        found = true;
      }
    }
  }
  
  if (!found) {
    await ctx.reply(`❌ No records found for \`${query}\``, { parse_mode: 'Markdown' });
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err);
  ctx.reply('❌ An unexpected error occurred. Please try again.');
});

// Start bot
console.log('🚀 Starting ZeroClaw Telegram Bot...');
bot.launch()
  .then(() => console.log('✅ Bot started successfully!'))
  .catch(err => console.error('❌ Failed to start bot:', err));

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
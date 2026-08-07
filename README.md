# ZeroClaw AI Escrow on Solana

An autonomous AI-to-AI commerce workflow built with ZeroClaw and Solana.

This project demonstrates how self-hosted AI agents can negotiate contracts, create on-chain escrow agreements, verify delivery, and settle payments through a Telegram interface while keeping humans in control of on-chain approvals.

The implementation combines ZeroClaw Skills, persistent memory, Telegram integration, and a Solana Anchor escrow program to showcase an end-to-end autonomous commerce workflow.

## ZeroClaw Features Used

- ✅ Skills
- ✅ Telegram Channel Integration
- ✅ Persistent Memory
- ✅ Human Approval Checkpoints
- ✅ Multi-step Workflow Orchestration
- ✅ Self-hosted Agent Runtime

## Architecture

```
zeroclaw/
├── skills/              # Four core skills
│   ├── negotiate_contract/  # LLM-based contract negotiation
│   ├── create_escrow/       # On-chain escrow creation
│   ├── verify_delivery/     # Delivery verification & approval
│   └── settle_escrow/       # Fund release or cancellation
├── memory/              # Persistent storage
│   ├── negotiations/    # Negotiated agreements
│   ├── escrows/         # Escrow states
│   └── settlements/     # Settlement records
└── config/              # Configuration files

telegram/                # Telegram bot interface
├── index.js             # Bot entry point
└── package.json         # Dependencies

solana/
├── escrow-program/      # Rust Anchor program
└── escrow-sdk/          # TypeScript SDK
```

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- Solana CLI (for local development)

### 1. Install Dependencies

```bash
# Telegram bot
cd telegram && npm install

# TypeScript SDK (already built)
cd solana/escrow-sdk && npm install
```

### 2. Configure Environment

Create `.env` in project root:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
SOLANA_RPC=https://api.devnet.solana.com
PROGRAM_ID=8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk
```

### 3. Run Telegram Bot

```bash
cd telegram && npm start
```

The bot will start and listen for commands.

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and overview |
| `/help` | Detailed usage guide |
| `/negotiate` | Step-by-step contract negotiation |
| `/escrow <id>` | Create on-chain escrow (requires approval) |
| `/verify <id>` | Verify delivery + buyer approval |
| `/settle <id>` | Release funds or cancel escrow |
| `/status <id>` | Check negotiation/escrow/settlement status |

## End-to-End Workflow

### 1. Negotiate Contract
```
/negotiate
```
Bot guides you through 8 steps:
1. Buyer asset (e.g., `gpu-a100-1h`)
2. Buyer max price (lamports)
3. Seller min price (lamports)
4. Asset type (e.g., `compute`)
5. Payment token (`SOL`)
6. Delivery method (`api`)
7. Verification method (`automatic`)
8. Deadline (Unix timestamp)

Output: Negotiation ID + agreement with SHA-256 hash

### 2. Create Escrow
```
/escrow <negotiation_id>
```
Shows agreement summary → Inline button for human approval → Creates escrow on Devnet

### 3. Verify Delivery
```
/verify <negotiation_id>
```
Submit delivery evidence → Request buyer approval via inline button → Calls `approveDelivery()`

### 4. Settle Escrow
```
/settle <negotiation_id>
```
Options:
- 💸 Release Funds (if approved)
- ❌ Cancel Escrow (if expired)
- 🔍 Check Status

## Memory Persistence

All state stored in `zeroclaw/memory/`:
- `negotiations/` - Agreements with hashes
- `escrows/` - PDA, signatures, vault addresses
- `settlements/` - Transaction records

## Solana Devnet Details

- **Program ID**: `8u17EnuW66yfRybQY6vGjeTnASeDyxyT6QesPetRtJxk`
- **RPC**: `https://api.devnet.solana.com`
- **Explorer**: https://explorer.solana.com/?cluster=devnet

## Demo Keypairs

For testing, demo keypairs are used:
- **Buyer**: `DcX5q52VJeRpZZfoX4fk6sqGpxGsQkAFCWuTJyg5WY3X`
- **Seller**: `2ve5JujWUeuVB2NsHagMHhcS9H9HYyiDis9gUgsMwh2m`

> ⚠️ **Production**: Replace with secure keypair management (HSM, KMS, etc.)

## Project Structure

```
.
├── .env                          # Environment variables
├── README.md                     # This file
├── PROJECT_STATUS.md             # Project status tracking
├── telegram/
│   ├── index.js                  # Telegraf bot entry point
│   └── package.json              # Node dependencies
├── zeroclaw/
│   ├── config/                   # Configuration
│   ├── memory/                   # Persistent state
│   │   ├── negotiations/
│   │   ├── escrows/
│   │   └── settlements/
│   ├── skills/
│   │   ├── negotiate_contract/
│   │   ├── create_escrow/
│   │   ├── verify_delivery/
│   │   └── settle_escrow/
│   └── sops/                     # Standard operating procedures
└── solana/
    ├── escrow-program/           # Rust Anchor program
    │   └── programs/escrow-program/
    └── escrow-sdk/               # TypeScript SDK
        ├── src/
        ├── idl/
        └── dist/
```

## Development

### Run Skills Directly (CLI)

```bash
# Negotiate
python3 zeroclaw/skills/negotiate_contract/negotiate_contract.py input.json

# Create escrow
python3 zeroclaw/skills/create_escrow/create_escrow.py input.json

# Verify delivery
python3 zeroclaw/skills/verify_delivery/verify_delivery.py input.json

# Settle escrow
python3 zeroclaw/skills/settle_escrow/settle_escrow.py input.json
```

### TypeScript SDK

```bash
cd solana/escrow-sdk
npm run build        # Compile TypeScript
npm run example:init # Run initialization example
```

## Security Notes

1. **Human Approval Required**: All on-chain transactions require explicit Telegram approval
2. **Demo Keys Only**: Current implementation uses hardcoded demo keypairs
3. **Devnet Only**: All transactions on Solana Devnet
4. **No Private Key Storage**: Keys should be managed externally in production

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot doesn't respond | Check `TELEGRAM_BOT_TOKEN` in `.env` |
| Skill fails | Ensure Python 3.10+ and dependencies |
| Transaction fails | Verify Devnet SOL balance for buyer |
| Memory not found | Check `zeroclaw/memory/` directory exists |

## License

MIT

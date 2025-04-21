# Cardano Smart Escrow

A secure, user-friendly escrow application built on the Cardano blockchain that allows users to lock and unlock ADA in a smart contract escrow.

![Cardano Smart Escrow](https://via.placeholder.com/800x400?text=Cardano+Smart+Escrow)

## Features

- **Wallet Integration**: Connect with popular Cardano wallets
- **Lock Funds**: Securely lock ADA in an escrow smart contract
- **Transaction Monitoring**: Real-time transaction status updates
- **Unlock Funds**: Release funds from escrow when conditions are met
- **Transaction History**: View all your escrow transactions

## Technology Stack

- **Frontend**: Next.js 15.x, React 19.x, TypeScript
- **Styling**: Tailwind CSS 4.x
- **State Management**: React Query (TanStack Query)
- **Blockchain**: Cardano
- **Wallet Integration**: [@ada-anvil/weld](https://github.com/ada-anvil/weld) for wallet connectivity

## Prerequisites

- Node.js 18.x or higher
- npm/yarn/pnpm or bun
- A compatible Cardano wallet extension (Eternl, Lace, etc.)

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/cardano-smart-escrow.git
cd cardano-smart-escrow

# Install dependencies
npm install
# or
yarn install
# or
pnpm install
```

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Cardano network (preprod or mainnet)
CARDANO_NETWORK=preprod

# Blockfrost API key for Cardano blockchain data
BLOCKFROST_API_KEY=your_blockfrost_api_key

# Optional: Webhook secret for Blockfrost notifications
WEBHOOK_SECRET=your_webhook_secret
```

Also create a `.env.example` file with the same structure (without actual values) for reference.

## Development

Start the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## API Routes

The application includes the following API endpoints:

- `GET /api/escrow/transactions?wallet={walletAddress}` - Get transactions for a wallet
- `POST /api/escrow/lock` - Create a new lock transaction
- `POST /api/escrow/unlock` - Create an unlock transaction
- `POST /api/escrow/submit` - Submit a signed transaction
- `POST /api/webhooks/blockfrost` - Webhook for Blockfrost transaction updates

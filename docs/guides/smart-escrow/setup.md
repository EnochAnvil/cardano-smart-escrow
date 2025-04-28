---
description: Set up the development environment and create the basic Next.js application structure for a Cardano smart escrow.
---

# Part 1: Project Setup

## Introduction

In this first part, we'll create a Next.js application as the foundation for our Cardano smart escrow. We'll focus on setting up the initial project structure and essential dependencies needed for the wallet integration we'll implement in Part 2.

## Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- Basic familiarity with React and Next.js
- A code editor (like VS Code)

## Steps

### 1. Create a new Next.js project

Start by creating a new Next.js application using create-next-app:

```bash
npx create-next-app@latest cardano-smart-escrow
cd cardano-smart-escrow
```

When prompted for options, select the following:
- TypeScript: Yes
- ESLint: Yes
- Tailwind CSS: Yes
- `src/` directory: Yes
- App Router: Yes
- Use TurboPack: (Optional)
- Custom Import Alias (@/*): No

### 2. Install Dependencies

For now, we'll only install the essential dependencies needed for our wallet integration:

```bash
npm install @ada-anvil/weld @tanstack/react-query better-sqlite3
npm install --save-dev @types/better-sqlite3
```

This installs:
- `@ada-anvil/weld`: For Cardano wallet integration. This allows you to connect to a CIP-30 compatible browser wallet (e.g., Eternl, Lace, etc.)
- `@tanstack/react-query`: For data fetching and caching
- `better-sqlite3`: For local database storage

### 3. Environment Variables

Create a `.env.example` file at the root of your project and populate it with the following:

```env

# Anvil API
ANVIL_API_ENDPOINT=https://preprod.api.ada-anvil.app/v2/services
ANVIL_API_KEY=YOUR_ANVIL_API_KEY

# Your Smart Contract Hash (See Blueprint Management Guide)
ESCROW_VALIDATOR_HASH=YOUR_ESCROW_VALIDATOR_HASH

# Database
SQLITE_DB_PATH=./data/escrow.db

# Webhook (handled in Step 5)
WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
```

Copy `.env.example` to `.env.local` and fill in your actual values. Don't worry about the actual `WEBHOOK_SECRET` value for now, we'll fill it in later. Make sure to never commit `.env.local`—add it to your `.gitignore`. 

### 4. Project Structure

Below is the complete directory structure you'll build throughout this guide series. This provides a roadmap of what we'll be creating:

```text
cardano-smart-escrow/
├── src/
│   ├── app/
│   │   ├── api/                    # API Routes
│   │   │   ├── escrow/             # Escrow API endpoints
│   │   │   │   ├── lock/           # Fund locking endpoint
│   │   │   │   │   └── route.ts    
│   │   │   │   ├── submit/         # Transaction submission
│   │   │   │   │   └── route.ts    
│   │   │   │   ├── transactions/   # Transaction listing
│   │   │   │   │   └── route.ts    
│   │   │   │   └── unlock/         # Fund unlocking endpoint
│   │   │   │       └── route.ts    
│   │   │   └── webhooks/           # External service handlers
│   │   │       └── blockfrost/     # Blockchain event notifications
│   │   │           └── route.ts    
│   │   ├── globals.css             # Global styles
│   │   ├── layout.tsx              # Main app layout
│   │   └── page.tsx                # Home page
│   ├── components/                 # React components
│   │   ├── LockFundsForm.tsx      # Form for locking ADA
│   │   ├── MyTransactions.tsx     # Transaction history display
│   │   ├── ReactQueryProvider.tsx  # Data fetching provider
│   │   ├── WalletConnector.tsx     # Wallet connection UI
│   │   └── WeldProvider.tsx        # Wallet provider setup
│   ├── hooks/                      # Custom React hooks
│   │   ├── useAmountSlider.ts      # ADA amount input slider
│   │   └── useTransactions.ts      # Transaction data management
│   └── lib/                        # Utility functions and types
│       ├── anvil-api.ts            # Anvil API integration
│       ├── db.ts                   # SQLite database functions
│       └── types.ts                # TypeScript type definitions
├── .env.example                    # Example configuration
└── .env.local                      # Local config (gitignored)
```

### 5. Update Global Styles

Update the global CSS file with some basic styles we'll use throughout the application `src/globals.css`:
The CSS details are not important for the guide. This just helps with the styling of the components we'll build.
```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
:root {
    --background: #0a0a0a86;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}

@layer components {
  .button-primary {
    @apply
      border-2
      border-neutral-800
      rounded-2xl
      px-4
      py-2
      font-bold
      shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
      transition-all
      hover:translate-x-1
      hover:translate-y-1
      hover:shadow-none
      bg-white
      hover:bg-gray-100
      text-black;
  }

  .section-card {
    @apply
      border-2
      border-neutral-800
      rounded-2xl
      p-4
      mb-4
      shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
      bg-white;
  }
  
  /* Custom slider styles for cross-browser compatibility */
  .slider-thumb {
    @apply appearance-none;
  }
  
  /* Webkit browsers (Chrome, Safari) */
  .slider-thumb::-webkit-slider-thumb {
    @apply appearance-none w-4 h-4 bg-black rounded-full cursor-pointer;
  }
  
  /* Firefox */
  .slider-thumb::-moz-range-thumb {
    @apply appearance-none w-4 h-4 bg-black rounded-full cursor-pointer border-0;
  }
  
  /* Microsoft Edge */
  .slider-thumb::-ms-thumb {
    @apply appearance-none w-4 h-4 bg-black rounded-full cursor-pointer;
  }
}

```

### 6. Configure Root Layout

Create a basic root layout component `src/app/layout.tsx`:

```tsx
// src/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cardano Smart Escrow',
  description: 'Lock and unlock funds securely on the Cardano blockchain',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

### 7. Create Basic Home Page

Create a simple home page as a placeholder `src/app/page.tsx`:

```tsx
// src/app/page.tsx
export default function Page() {
  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 text-black">Cardano Smart Escrow</h1>
      {/* Wallet connector will go here in Part 2 */}
      {/* Fund locking will go here in Part 3 */}
      {/* Transaction dashboard will go here in Part 4 */}
    </main>
  );
}
```

## Testing Your Setup

Let's make sure your basic setup is working correctly:

1. Start your development server:

```bash
npm run dev
```

2. Navigate to http://localhost:3000 in your browser

3. You should see the placeholder home page with the title "Cardano Smart Escrow"

## What's Next?

In Part 2, we'll build on this foundation by adding wallet connectivity using the Weld library, allowing users to connect their Cardano wallets to our application.

{% hint style="success" %}
Congratulations! You've completed Part 1 of the guide. You now have a basic Next.js project set up for our Cardano smart escrow application.
{% endhint %}

---
description: Create a transaction dashboard to display locked funds and track transaction status using React Query and SQLite.
---

# Part 4: Transaction Dashboard

## Introduction

In this part, we'll build a transaction dashboard that displays the user's transaction history and status. This will allow users to monitor their locked funds and see when transactions are confirmed on the blockchain. We'll also set up a database to persistently store transaction data.

## Database Configuration

In previous parts, we built a wallet connector and fund locking functionality, but we didn't store transaction information. Let's add database support now to track transactions.

### 1. Create Data Directory

Create a directory for the SQLite database. Add a `data` directory to the root folder.
This will be used to store the database file `escrow.db`.

### 2. Set Up the Database

Create a database utility file:

```typescript
// src/lib/db.ts
import sqlite from 'better-sqlite3';
import path from 'path';
import { TransactionStatus } from './types';

const dbPath = process.env.SQLITE_DB_PATH || './data/escrow.db';
const db = sqlite(dbPath);

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    address TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS transactions (
    txHash TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (wallet) REFERENCES wallets(address)
  );
`);

export function upsertWallet(address: string) {
  db.prepare(`INSERT OR IGNORE INTO wallets(address) VALUES (?)`).run(address);
}

export function upsertTx(
  txHash: string,
  wallet: string,
  amount: number,
  status: TransactionStatus
) {
  db.prepare(
    `INSERT OR REPLACE INTO transactions(
       txHash, wallet, amount, status, timestamp
     ) VALUES (?, ?, ?, ?, ?)`
  ).run(txHash, wallet, amount, status, Date.now());
}

export function getTxsByWallet(wallet: string) {
  return db
    .prepare(`SELECT * FROM transactions WHERE wallet = ? ORDER BY timestamp DESC`)
    .all(wallet);
}

export function updateTxStatus(
  txHash: string,
  status: TransactionStatus
) {
  db.prepare(
    `UPDATE transactions SET status = ?, timestamp = ? WHERE txHash = ?`
  ).run(status, Date.now(), txHash);
}

export function getTxsByHash(txHash: string) {
  return db
    .prepare(`SELECT * FROM transactions WHERE txHash = ?`)
    .get(txHash);
}
```

## React Query Setup

Now let's set up React Query for data fetching:

### 1. Create the React Query Provider

```typescript
// src/components/ReactQueryProvider.tsx
"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

const queryClient = new QueryClient();

export default function ReactQueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### 2. Update Root Layout

Update the root layout to include the React Query provider:

```tsx
// src/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import CustomWeldProvider from '@/components/WeldProvider';
import ReactQueryProvider from '@/components/ReactQueryProvider';

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
      <body>
        <ReactQueryProvider>
          <CustomWeldProvider>
            {children}
          </CustomWeldProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
```

## Transaction API Endpoint

Let's create an API endpoint to fetch transactions for a specific wallet:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTxsByWallet } from '@/lib/db';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');

  // Validate wallet parameter
  if (!wallet) {
    return NextResponse.json(
      { error: 'Missing wallet parameter' },
      { status: 400 }
    );
  }

  try {
    const txs = getTxsByWallet(wallet);
    return NextResponse.json(txs);
  } catch (error: unknown) {
    console.error('Error fetching transactions:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

```

## Update Submit Transaction Endpoint

Let's update the submit endpoint to store transaction data in the database:

```typescript
// src/app/api/escrow/submit/route.ts
// ... other imports
import { TX_STATUS } from '@/lib/types'; // add this line
import { upsertWallet, upsertTx } from '@/lib/db'; // add this line

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Add changeAddress, and amount from the request body
    const { complete, signature, changeAddress, amount, type } = body;
    
    // ... other code

    const result = await submitTransaction(signature, complete);
    upsertWallet(changeAddress); // add this line

    // Normally we would have this as PENDING, but since we're simulating a confirmation
    // we set it to CONFIRMED. When we get live updates from the blockchain, we'll update
    // the status to PENDING.
    upsertTx(result.txHash, changeAddress, amount, TX_STATUS.CONFIRMED); // add this line

    return NextResponse.json({ txHash: result.txHash });
  } catch (error: unknown) {
    // ... other error handling
  }
}
```

## Update Transaction Hooks

Add the following functions to `src/hooks/useTransactions.ts`:

1. fetchTransactions - Fetches transactions from the API
2. useTransactionsByWallet - Retrieves transactions for a specific wallet

```typescript
// src/hooks/useTransactions.ts
"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
// ... other imports

// Function to fetch transactions from our API
async function fetchTransactions(wallet: string): Promise<Transaction[]> {
  if (!wallet) return [];
  
  const response = await fetch(`/api/escrow/transactions?wallet=${encodeURIComponent(wallet)}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch transactions');
  }
  
  return response.json();
}

// Hook to get transactions by wallet
export function useTransactionsByWallet(wallet?: string) {
  return useQuery({
    queryKey: ['transactions', wallet],
    queryFn: () => fetchTransactions(wallet || ''),
    enabled: !!wallet, // Only run query if wallet is provided
  });
}

```

## Create the MyTransactions Component

Let's create a component to display transaction history:

```tsx
"use client";

import { useWallet } from '@ada-anvil/weld/react';
import { useTransactionsByWallet } from '@/hooks/useTransactions';
import { Transaction, TransactionStatus, TX_STATUS } from '@/lib/types';

const formatTxHash = (hash: string): string => {
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 4)}`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
};

const formatAmount = (lovelaceAmount: number): string => {
  return (lovelaceAmount / 1_000_000).toFixed(2);
};

const STATUS_STYLES: Record<TransactionStatus, string> = {
  [TX_STATUS.PENDING]: 'bg-yellow-100 text-yellow-800',
  [TX_STATUS.SIGN_LOCK]: 'bg-yellow-100 text-yellow-800',
  [TX_STATUS.SIGN_UNLOCK]: 'bg-yellow-100 text-yellow-800',
  [TX_STATUS.CONFIRMED]: 'bg-green-100 text-green-800',
  [TX_STATUS.UNLOCKED]: 'bg-blue-100 text-blue-800',
};
const STATUS_LABELS: Record<TransactionStatus, string> = {
  [TX_STATUS.PENDING]: 'Pending',
  [TX_STATUS.SIGN_LOCK]: 'Sign to Lock',
  [TX_STATUS.SIGN_UNLOCK]: 'Sign to Unlock',
  [TX_STATUS.CONFIRMED]: 'Confirmed',
  [TX_STATUS.UNLOCKED]: 'Unlocked',
};

const STATUS_DETAILS: Record<TransactionStatus, string> = {
  [TX_STATUS.PENDING]: 'Waiting for Cardano blockchain confirmation...',
  [TX_STATUS.SIGN_LOCK]: 'Transaction needs to be signed to lock funds',
  [TX_STATUS.SIGN_UNLOCK]: 'Transaction needs to be signed to unlock funds',
  [TX_STATUS.CONFIRMED]: 'Transaction confirmed on the Cardano blockchain',
  [TX_STATUS.UNLOCKED]: 'Funds have been successfully unlocked',
};

export default function MyTransactions() {
  const wallet = useWallet();
  const address = wallet.changeAddressBech32;
  
  const { data: transactions = [], error, isLoading } = useTransactionsByWallet(address);
  
  return (
    <section className="section-card text-black">
      <h2 className="text-xl font-bold mb-4 text-black">My Transactions</h2>
      
      {/* Handle different states */}
      {!address && (
        <div className="p-8 text-center bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-600">Please connect your wallet to view your transactions.</p>
        </div>
      )}
      
      {address && error && (
        <div className="p-6 bg-red-50 text-red-700 rounded-lg border border-red-200">
          <h3 className="font-bold mb-2">Error loading transactions</h3>
          <p>{(error as Error).message}</p>
        </div>
      )}
      
      {address && isLoading && (
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading your transactions...</p>
        </div>
      )}
      
      {/* Display transactions if no errors, not loading, and have an active Weld wallet address*/}
      {address && !error && !isLoading && (
        <>
          {/* Display empty state if no transactions */}
          {transactions.length === 0 ? (
            <div className="p-8 text-center bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-600">No transactions found. Lock some funds to get started.</p>
            </div>
          ) : (
            // Display transactions table
            <table className="w-full text-left border-collapse text-black">
              <thead>
                <tr>
                  <th className="px-4 py-2">Transaction</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction: Transaction) => {
                  const isPending = transaction.status === TX_STATUS.PENDING;
                  
                  return (
                    <tr 
                      key={transaction.txHash} 
                      className={`border-t hover:bg-gray-50 ${isPending ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono">
                        <a 
                          href={`https://preprod.cardanoscan.io/transaction/${transaction.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                          title={transaction.txHash}
                        >
                          {formatTxHash(transaction.txHash)}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right">{formatAmount(transaction.amount)} ADA</td>
                      <td className="px-4 py-3 text-center">
                        {isPending ? (
                            <span className="inline-flex items-center" title={STATUS_DETAILS[transaction.status]}>
                              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[transaction.status]}`}>
                                {STATUS_LABELS[transaction.status]}
                              </span>
                              <span className="ml-2 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-yellow-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                              </span>
                            </span> 
                          ) : (
                            <span 
                              className={`inline-block px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[transaction.status] || 'bg-gray-100 text-gray-800'}`}
                              title={STATUS_DETAILS[transaction.status]}
                            > 
                            {STATUS_LABELS[transaction.status] || transaction.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{formatDate(transaction.timestamp)}</td>
                      <td className="px-4 py-3 text-center">
                        {/* Unlock button will go here.*/}
                        <span className="text-gray-400">-</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

```

## Update the Home Page

Finally, update the home page to include the MyTransactions component:

```tsx
// src/app/page.tsx
import WalletConnector from '@/components/WalletConnector';
import LockFundsForm from '@/components/LockFundsForm';
import MyTransactions from '@/components/MyTransactions';

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Cardano Smart Escrow</h1>
      <WalletConnector />
      <LockFundsForm />
      <MyTransactions />
    </main>
  );
}
```

## Understanding the Transaction Dashboard

### Data Flow

Here's how data flows through our application:

1. **Database Storage**: When a transaction is created, it's stored in the SQLite database
2. **API Endpoint**: The `/api/escrow/transactions` endpoint fetches transactions for a specific wallet
3. **React Query**: Manages data fetching, caching, and periodic refreshing
4. **MyTransactions Component**: Displays transaction data to the user

## Testing Your Transaction Dashboard

To test the transaction dashboard:

1. Start your development server:

```bash
npm run dev
```

2. Navigate to http://localhost:3000 in your browser

3. Connect your wallet

4. Use the LockFundsForm to lock some funds

5. Observe the transaction appearing in the MyTransactions component. 

6. Notice that the transaction sits in the `Pending` state. In the next part, we'll implement webhook notifications for immediate updates when enough confirmations are received.

## Troubleshooting

### Database Issues

If you encounter database-related errors:

- Ensure the `data` directory exists and has proper permissions
- Check that the `SQLITE_DB_PATH` environment variable is set correctly
- If using Windows, you might need to install build tools with `npm install --global --production windows-build-tools`

### Transaction Data Not Showing

If transactions don't appear in the dashboard:

- Verify that your wallet is correctly connected
- Check the browser console for API errors
- Make sure you're using the same wallet address that was used to create the transactions

{% hint style="success" %}
Congratulations! You've completed Part 4 of the guide. Your application now has a fully functioning transaction dashboard to monitor locked funds.
{% endhint %}

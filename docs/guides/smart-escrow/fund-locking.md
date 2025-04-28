---
description: Implement the fund locking functionality to allow users to securely lock their ADA in an escrow contract.
---

# Part 3: Fund Locking

## Introduction

In this part, we'll implement the fund locking functionality, which allows users to securely lock their ADA in an escrow contract. This involves creating a transaction that transfers funds to a script address with specific conditions for unlocking.

## Understanding the Fund Locking Process

The fund locking process involves these steps:

1. **User Input**: The user selects an amount of ADA to lock.

2. **Transaction Building**: The application calls the Anvil API to build a transaction that sends funds to the escrow script address with the user's key hash as a datum.

3. **Transaction Signing**: The connected wallet signs the transaction, authorizing the fund transfer.

4. **Transaction Submission**: The signed transaction is submitted to the Cardano blockchain.

5. **Status Tracking**: The transaction hash is displayed to the user. In Part 4, we'll implement proper status tracking.

## Smart Contract Datum Structure

When locking funds in the escrow address, we attach a datum containing the owner's verification key hash. This datum is essential for two reasons:

1. The Hello World smart contract uses it to validate unlock requests
2. It associates locked funds with their rightful owner

When building transaction outputs, we include this datum with the escrow script address, ensuring only the original owner can later unlock these funds with the correct signature.

```typescript
datum: {
  type: "inline",
  value: {
    owner: paymentKeyHash  // The owner's key hash who can later unlock
  },
  shape: {
    validatorHash: validatorHash,
    purpose: "spend"
  }
}
```

This datum associates the locked funds with the original owner, ensuring only they can unlock these funds later when providing the correct redeemer message ("Hello, World!") and their signature.

## Setup React Query

Before we integrate with the Anvil API, let's first set up React Query which we'll use for managing transaction state `src/components/ReactQueryProvider.tsx`:

### 1. Create React Query Provider

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

Update your `src/app/layout.tsx` component to include the React Query provider:
You need to add the import and wrap the application with the `ReactQueryProvider` provider.

```tsx
// src/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { ClientWeldProvider } from '@/components/WeldProvider'; 
import ReactQueryProvider from '@/components/ReactQueryProvider'; //Add this line
import { cookies } from 'next/headers';
import { STORAGE_KEYS } from '@ada-anvil/weld/server';

// ... other imports and font definitions

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  // ... other code ...

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ReactQueryProvider> {/* Add this line */}
          <ClientWeldProvider lastConnectedWallet={lastConnectedWallet}>
            {children}
          </ClientWeldProvider>
        </ReactQueryProvider> {/* Add this line */}
      </body>
    </html>
  );
}
```

## Adding Anvil API Integration

We'll first set up the Anvil API integration, which we'll use for transaction building and submission.

### 2. Create the Anvil API Module

Let's create a `src/lib/anvil-api.ts` module to handle interactions with the Anvil API for building and submitting transactions:
Notice how the `lockFunds` function that calls the Anvil API. This is building a transaction that sends ADA to the escrow script address with the specified datum.
Once submitted, the transaction will be included in a block and the ADA will be locked in the escrow address.

```typescript
// src/lib/anvil-api.ts
const API = process.env.ANVIL_API_ENDPOINT;
const X_API_KEY = process.env.ANVIL_API_KEY;

if (!API || !X_API_KEY) {
  throw new Error('ANVIL_API_ENDPOINT or ANVIL_API_KEY environment variables are not set');
}

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'x-api-key': X_API_KEY,
});

// Error handling utilities
const handleApiError = (context: string, error: unknown): string => {
  console.error(`Error ${context}:`, error);
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to ${context}: ${message}`;
};

// Generic API fetch with error handling
async function fetchApi<T>(endpoint: string, options: RequestInit, context: string): Promise<T> {
  try {
    const response = await fetch(`${API}${endpoint}`, options);
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`${context} error:`, response.status, response.statusText, errText);
      throw new Error(`${response.status} ${response.statusText} - ${errText}`);
    }
    
    return await response.json() as T;
  } catch (error) {
    throw new Error(handleApiError(context, error));
  }
}

// Interface for lock funds parameters
interface LockFundsParams {
  changeAddress: string;     // User's wallet address for change
  lovelaceAmount: number;    // Amount in lovelace to lock in escrow
  ownerKeyHash: string;      // Public key hash of the owner who can unlock funds
  message?: string;          // Optional transaction message
}

// Interface for the lock funds response
interface LockFundsResponse {
  txHash?: string;  // Transaction hash if successful
  complete?: string; // Complete tx for client-side signing
  error?: string;   // Error message if the request fails
}

/**
 * Get the script address for a validator hash
 */
export async function getScriptAddress(validatorHash: string): Promise<string> {
  const data = await fetchApi<{ hex: string }>(
    `/validators/${validatorHash}/address`,
    {
      method: 'GET',
      headers: getHeaders(),
    },
    'get script address'
  );
  return data.hex;
}

/**
 * Get the payment verification key hash from an address
 */
export async function getAddressKeyHash(address: string): Promise<string> {
  const data = await fetchApi<{ payment: string }>(
    `/utils/addresses/parse`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ address }),
    },
    'get address key hash'
  );
  return data.payment;
}

/**
 * Lock funds in the escrow smart contract
 * This creates a transaction that sends ADA to the script address with the specified datum
 */
export async function lockFunds(params: LockFundsParams): Promise<LockFundsResponse> {
  try {
    // Derive owner payment key hash for datum
    const paymentKeyHash = await getAddressKeyHash(params.changeAddress);
    
    // Get the validator hash from environment
    const validatorHash = process.env.ESCROW_VALIDATOR_HASH;
    if (!validatorHash) {
      throw new Error('Escrow validator hash not found');
    }
    
    // Get script address
    const scriptAddress = await getScriptAddress(validatorHash);
    
    // Prepare the transaction input
    const input = {
      changeAddress: params.changeAddress,
      message: params.message || "Locking funds in escrow using Anvil API",
      outputs: [
        {
          address: scriptAddress,
          lovelace: params.lovelaceAmount,
          datum: {
            type: "inline",
            value: {
              owner: paymentKeyHash
            },
            shape: {
              validatorHash: validatorHash,
              purpose: "spend"
            }
          }
        }
      ],
    };

    // Build the transaction using our generic fetch utility
    const result = await fetchApi<{ hash: string, complete: string }>(
      `/transactions/build`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(input),
      },
      'build lock transaction'
    );
    
    // Return hash and complete transaction for client-side signing and DB recording
    return {
      txHash: result.hash,
      complete: result.complete,
    };
  } catch (error: unknown) {
    console.error('Error locking funds:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

/**
 * Submit a signed transaction to the blockchain
 */
export async function submitTransaction(signedTx: string, complete: string): Promise<{ txHash: string }> {
  const result = await fetchApi<{ txHash: string }>(
    `/transactions/submit`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        signatures: [signedTx],
        transaction: complete,
      }),
    },
    'submit transaction'
  );
  
  return { txHash: result.txHash };
}
```

### 4. Update Transaction Status Types

Let's add a new `types.ts` file to include the states for the locking process:

```typescript
// src/lib/types.ts
// Transaction status constants
export const TX_STATUS = {
  PENDING: 'pending' as const,
  SIGN_LOCK: 'signLock' as const,
  SIGN_UNLOCK: 'signUnlock' as const,
  CONFIRMED: 'confirmed' as const,
  UNLOCKED: 'unlocked' as const,
} as const;

// Create a type from the values
export type TransactionStatus = typeof TX_STATUS[keyof typeof TX_STATUS];

export type Transaction = {
  txHash: string;
  wallet: string;
  amount: number;
  status: TransactionStatus;
  timestamp: number;
};
```

### 5. Create API Endpoint for Locking Funds

Now, let's create an API endpoint `src/app/api/escrow/lock/route.ts` in our Next.js application for locking funds:

```typescript
// src/app/api/escrow/lock/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { lockFunds } from '@/lib/anvil-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { changeAddress, amount, ownerKeyHash, message } = body;

    if (!changeAddress || amount == null || !ownerKeyHash) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const { txHash, complete, error } = await lockFunds({
      changeAddress,
      lovelaceAmount: amount,
      ownerKeyHash,
      message: message || 'Locking funds in escrow using Anvil API',
    });

    if (error || !txHash || !complete) {
      return NextResponse.json(
        { error: error || 'Failed to build lock transaction' },
        { status: 500 }
      );
    }

    return NextResponse.json({ txHash, complete });
  } catch (err: unknown) {
    console.error('Error locking funds:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message || 'Failed to lock funds' },
      { status: 500 }
    );
  }
}
```

### 6. Create API Endpoint for Transaction Submission

After we have called the API to build the transaction, we will prompt the user to sign the transaction via Weld.
Upon signing, we will submit the signed transaction to the blockchain via the following API route:
This `src/app/api/escrow/submit/route.ts` endpoint will be used for submitting both lock and unlock transactions. We will update it later to handle unlock transactions.

```typescript
// src/app/api/escrow/submit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { submitTransaction } from '@/lib/anvil-api';
import { TX_STATUS } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { complete, signature, type } = body;
    
    // Validate inputs
    if (!complete || !signature || type !== TX_STATUS.SIGN_LOCK) {
      return NextResponse.json(
        { error: 'Missing complete transaction or signature' },
        { status: 400 }
      );
    }

    // Submit the signed transaction to the blockchain
    const result = await submitTransaction(signature, complete);

    return NextResponse.json({ txHash: result.txHash });
  } catch (error: unknown) {
    console.error('Error submitting transaction:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message || 'Failed to submit transaction' },
      { status: 500 }
    );
  }
}
```

### 7. Create the Transaction Operations Hook

Let's create a custom hook `src/hooks/useTransactionOperations.ts` to handle transaction operations:
See the `lockFunds` function to see how we call our API endpoints and use Weld to sign the transaction between calls. We will also update this later to handle unlock transactions.

```typescript
// src/hooks/useTransactionOperations.ts
"use client";

import { useQueryClient } from '@tanstack/react-query';
import { Transaction, TransactionStatus, TX_STATUS } from '@/lib/types';
import { useCallback, useState } from 'react';

export function useTransactionUpdater(wallet?: string) {
  const queryClient = useQueryClient();
  
  return useCallback(
    (txHash: string, newStatus: TransactionStatus, newTransaction?: Partial<Transaction>) => {
      if (!wallet) return;
      
      // Update cache optimistically
      queryClient.setQueryData<Transaction[]>(
        ['transactions', wallet],
        old => {
          if (!old) return [];
          
          // Update existing transaction or add new one
          const existingTx = old.find(tx => tx.txHash === txHash);
          if (existingTx) {
            return old.map(tx => 
              tx.txHash === txHash ? { ...tx, status: newStatus } : tx
            );
          } 
          
          // Create and add new transaction if provided
          if (newTransaction) {
            const newTx: Transaction = {
              txHash,
              wallet: wallet,
              amount: newTransaction.amount || 0,
              status: newStatus,
              timestamp: newTransaction.timestamp || Date.now(),
            };
            return [newTx, ...old];
          }
          
          return old;
        }
      );
      
      // Refresh data from server
      queryClient.invalidateQueries({ queryKey: ['transactions', wallet] });
    },
    [queryClient, wallet]
  );
}

//--------------------------------------------------------------
// Transaction operation hooks (API calls, wallet operations)
//--------------------------------------------------------------

/**
 * Hook to manage transaction operations (locking and unlocking funds)
 * @param wallet - The wallet instance from useWallet()
 * @param address - The wallet address to use for transactions
 * @returns Functions and state for transaction operations
 */
// Define types for better readability
type CardanoWallet = {
  changeAddressHex?: string;
  handler?: {
    signTx: (txComplete: string, witnessOnly: boolean) => Promise<string>;
  };
};

// API response types
interface TransactionResponse {
  txHash: string;
  error?: string;
}

interface BuildTransactionResponse {
  complete?: string;
  error?: string;
}

const apiPost = async <T>(endpoint: string, payload: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`/api/escrow/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  
  return data as T;
};

export function useTransactionOperations(wallet: CardanoWallet, address?: string) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateTransaction = useTransactionUpdater(address);

  const buildLockTransaction = async (lovelaceAmount: number) => {
    if (!address || !wallet?.changeAddressHex) return null;
    
    const data = await apiPost<BuildTransactionResponse>('lock', {
      changeAddress: address,
      amount: lovelaceAmount,
      ownerKeyHash: wallet.changeAddressHex,
      message: `Locking ${lovelaceAmount / 1_000_000} ADA in escrow`
    });
    
    if (!data.complete) {
      throw new Error('Build failed');
    }
    
    return data.complete;
  };

  // Transaction signing and submission
  const signTransaction = async (txComplete: string): Promise<string> => {
    const signed = await wallet?.handler?.signTx(txComplete, true);
    if (!signed) {
      throw new Error('Signing failed');
    }
    return signed;
  };
  
  const submitLockTransaction = async (signedTx: string, txComplete: string, lovelaceAmount: number): Promise<TransactionResponse> => {
    return apiPost<TransactionResponse>('submit', {
      signature: signedTx,
      complete: txComplete,
      changeAddress: address,
      amount: lovelaceAmount,
      type: TX_STATUS.SIGN_LOCK
    });
  };
  
  const lockFunds = async (adaAmount: number) => {
    if (!address) return null;
    
    setError(null);
    setProcessing('lock');
    
    try {
      // Convert ADA to Lovelace (smallest unit)
      const lovelaceAmount = adaAmount * 1_000_000;
      
      // Build → Sign → Submit pattern
      const txComplete = await buildLockTransaction(lovelaceAmount);
      if (!txComplete) throw new Error('Failed to build transaction');
      
      const signedTx = await signTransaction(txComplete);
      const result = await submitLockTransaction(signedTx, txComplete, lovelaceAmount);
      
      // Update transaction status in cache
      if (result.txHash) {
        updateTransaction(result.txHash, TX_STATUS.PENDING, {
          amount: lovelaceAmount,
          timestamp: Date.now()
        });
      }
      
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setProcessing(null);
    }
  };

  return {
    lockFunds,
    processing,
    error
  };
}
```

This hook encapsulates the logic for building, signing, and submitting transactions. It handles all the API calls and error states, making our component code cleaner.

### 8a. Create the Lock Funds Form Component

Now, let's create the form component `src/components/LockFundsForm.tsx` for locking funds:

```tsx
// src/components/LockFundsForm.tsx
"use client";

import { useState } from 'react';
import { useWallet } from '@ada-anvil/weld/react';
import { useAmountSlider } from '@/hooks/useAmountSlider';
import { useTransactionOperations } from '@/hooks/useTransactions';

export default function LockFundsForm() {
  const wallet = useWallet();
  const address = wallet.changeAddressBech32;
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const { lockFunds, processing, error: errorMessage } = useTransactionOperations(wallet, address);
  const isLocking = processing === 'lock';
  
  const { 
    amount, 
    maxAmount, 
    handleAmountChange, 
    handleInputChange,
    sliderBackground,
    isWalletConnected
  } = useAmountSlider({ wallet });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isWalletConnected || amount <= 0 || !wallet.changeAddressBech32) return;
    
    setSuccessMessage(null);
    setTxHash(null);
    
    try {
      const result = await lockFunds(amount);
      
      if (result?.txHash) {
        setSuccessMessage(`Successfully prepared transaction to lock ${amount} ADA`);
        setTxHash(result.txHash);
      }
    } catch (error) {
      console.error('Failed to lock funds:', error);
    }
  };
  
  return (
    <section className="section-card">
      <h2 className="text-xl font-bold mb-4 text-black">Lock Funds</h2>
      
      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg shadow-md border border-red-200">
          <div className="font-medium">{errorMessage}</div>
        </div>
      )}
      
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-lg shadow-md border border-green-200">
          <div className="font-medium">{successMessage}</div>
          {txHash && (
            <div className="mt-2 text-sm bg-white p-2 rounded border border-gray-200">
              <span className="text-gray-700">Transaction: </span>
              <span className="font-mono break-all">{txHash}</span>
            </div>
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="amount-slider" className="block text-sm font-medium text-gray-700 mb-2">
            Amount to Lock (ADA)
          </label>
          
          <div className="flex items-center gap-4">
            <div className="flex-grow relative py-2">
              <input 
                type="range" 
                id="amount-slider"
                min="1" 
                max={maxAmount} 
                step="1"
                value={amount}
                onChange={handleAmountChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 slider-thumb"
                disabled={!isWalletConnected}
                style={{
                  background: sliderBackground
                }}
              />
            </div>
            
            <div className="relative w-24">
              <input
                type="number"
                name="lockAmount"
                value={amount}
                onChange={handleInputChange}
                min="1"
                max={maxAmount}
                step="1"
                className="w-full p-2 border-2 border-neutral-800 rounded-lg text-right text-black"
                disabled={!isWalletConnected}
              />
            </div>
          </div>
          
          <p className="mt-1 text-sm text-gray-500">
            {isWalletConnected 
              ? `Available: ${wallet.balanceAda?.toFixed(2) || '0.00'} ADA` 
              : 'Connect wallet to lock funds'}
          </p>
        </div>
        
        <button
          type="submit"
          disabled={!isWalletConnected || isLocking || amount <= 0}
          className="button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLocking ? 'Processing...' : 'Lock Funds'}
        </button>
      </form>
    </section>
  );
}
```

### 8b. Create the Amount Slider Hook

Let's create a custom hook `src/hooks/useAmountSlider.ts` for the amount slider to make our form component cleaner:

```typescript
// src/hooks/useAmountSlider.ts
import { useState, ChangeEvent, useMemo, useEffect } from 'react';
import { useWallet } from '@ada-anvil/weld/react';

type UseAmountSliderProps = {
  wallet: ReturnType<typeof useWallet>;
};

export const useAmountSlider = ({ wallet }: UseAmountSliderProps) => {
  const [amount, setAmount] = useState<number>(1);
  const maxAmount = Number(wallet.balanceAda?.toFixed(2) || 1);
  
  useEffect(() => {
    if (!wallet.isConnected && amount !== 1) {
      setAmount(1);
    }
  }, [wallet.isConnected, amount]);
  
  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newAmount = parseFloat(e.target.value);
    const clampedAmount = Math.min(Math.max(newAmount, 1), maxAmount);
    setAmount(clampedAmount);
  };
  
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    if (value === '') {
      setAmount(1);
      return;
    }
    
    const newAmount = parseFloat(value);
    
    if (!isNaN(newAmount)) {
      const clampedAmount = Math.min(Math.max(newAmount, 1), maxAmount);
      setAmount(clampedAmount);
    }
  };
  
  const isConnected = wallet.isConnected;
  
  const sliderBackground = useMemo(() => {
    if (!isConnected) return '#e5e7eb';
    const percentage = (amount / maxAmount) * 100;
    return `linear-gradient(to right, black 0%, black ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`;
  }, [isConnected, amount, maxAmount]);
  
  return {
    amount,
    setAmount,
    maxAmount,
    handleAmountChange,
    handleInputChange,
    sliderBackground,
    isWalletConnected: wallet.isConnected
  };
};
```

### 9. Update the Home Page

Finally, update the home page `src/app/page.tsx` to include the LockFundsForm component:

```tsx
// src/app/page.tsx
/**
 * Main dashboard page for the Cardano Smart Escrow application
 * Displays wallet connector and escrow functionality
 */

import WalletConnector from "@/components/WalletConnector";
import LockFundsForm from "@/components/LockFundsForm";

export default function Page() {
  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 text-black">Cardano Smart Escrow</h1>
      <WalletConnector />
      <LockFundsForm />
    </main>
  );
}
```

## Testing Your Implementation

To test the fund locking functionality:

1. Start your development server:

```bash
npm run dev
```

2. Navigate to http://localhost:3000 in your browser

3. Connect your wallet using the wallet connector

4. Use the slider to select an amount of ADA to lock

5. Click the "Lock Funds" button

6. Approve the transaction in your wallet when prompted

7. Verify that you see a success message with the transaction hash

## Troubleshooting

### Transaction Building Errors

If you encounter errors when building transactions:

- Check that your Anvil API key is correct in your `.env.local` file
- Verify that the validator hash is set correctly in your environment variables
- Ensure your wallet has sufficient funds (including for transaction fees)
- Check the browser console and server logs for more detailed error messages

### Wallet Signing Errors

If transaction signing fails:

- Make sure your wallet is unlocked
- Check that you've approved the dApp connection
- Try refreshing the page and reconnecting your wallet

{% hint style="info" %}
In a real application, you'd want to store transaction details for later reference. This lessens your need to query the blockchain for users transactions. We'll implement this in Part 4 using a database.
{% endhint %}

{% hint style="success" %}
Congratulations! You've completed Part 3 of the guide. Your application can now lock funds in a Cardano smart escrow contract.
{% endhint %}

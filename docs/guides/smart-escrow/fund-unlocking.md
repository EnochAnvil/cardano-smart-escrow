---
description: Complete the escrow lifecycle by implementing fund unlocking functionality to allow users to retrieve their locked funds.
---

# Part 6: Fund Unlocking

## Introduction

In this final part, we'll implement the fund unlocking functionality to complete the escrow lifecycle. This will allow users to retrieve their funds from the escrow contract once they're ready. The unlocking process requires signature verification to ensure that only the rightful owner can access the funds.

## Understanding the Fund Unlocking Process

The fund unlocking process involves these steps:

1. **Transaction Verification**: The system checks that the transaction exists and is in the CONFIRMED(i.e. Locked) state

2. **Ownership Validation**: The request must come from the same wallet that originally locked the funds

3. **Transaction Building**: The application builds an unlock transaction that spends the locked UTXO

4. **Transaction Signing**: The user signs the transaction with their wallet

5. **Transaction Submission**: The signed transaction is submitted to the blockchain

6. **Status Update**: The transaction status is updated to UNLOCKED in the database

## Understanding the Smart Contract Validation

Our escrow application uses the Hello Aiken smart contract with two unlock conditions:

1. **Redeemer Message Validation**: The redeemer must contain the exact message "Hello, World!" (hex-encoded)
2. **Owner Signature Verification**: The transaction must be signed by the owner specified in the datum

The code implements these requirements through:

```typescript
redeemer: {
  type: "json",
  value: {
    // The Hello, World! message must match what's expected in the smart contract
    // The Hello, World message is hardcoded in the smart contract
    msg: Buffer.from("Hello, World!", "utf8").toString("hex"),
  },
},
// Ensure the transaction includes the owner's signature
requiredSigners: [signerKeyHash],
```

This dual validation ensures only the rightful owner can unlock their funds, while demonstrating the flexibility of Cardano's eUTXO model for custom validation logic.

## Implementation Steps

### 1. Add Unlock Functions to the Anvil API Module

First, let's add the necessary functions to the Anvil API module for unlocking funds. Add `unlockFunds` to your existing `src/lib/anvil-api.ts` file:

```typescript
// Interface for unlock funds parameters
export interface UnlockFundsParams {
  txHash: string;
  changeAddress: string;
  ownerKeyHash: string;       // Key hash for requiredSigners
  unlockReason?: string;
}

// Interface for the unlock funds response
export interface UnlockFundsResponse {
  complete?: string;
  error?: string;
}

/**
 * Unlock funds from the escrow smart contract
 * This creates a transaction that spends the UTXO with the specified redeemer
 */
export async function unlockFunds(
  params: UnlockFundsParams
): Promise<UnlockFundsResponse> {
  try {
    // Get the validator hash from environment
    const validatorHash = process.env.ESCROW_VALIDATOR_HASH;
    if (!validatorHash) {
      throw new Error('Escrow validator hash not found');
    }

    // Derive owner payment key hash for requiredSigners
    const signerKeyHash = await getAddressKeyHash(params.changeAddress);

    const input = {
      changeAddress: params.changeAddress,
      message: params.unlockReason || 'Unlocking funds using Anvil API',
      scriptInteractions: [
        {
          hash: validatorHash,
          purpose: 'spend',
          outputRef: {
            txHash: params.txHash,
            index: 0,
          },
          redeemer: {
            type: "json",
            value: {
              msg: Buffer.from("Hello, World!", "utf8").toString("hex"),
            },
          },
        },
      ],
      requiredSigners: [signerKeyHash],
    };

    // Build the transaction using our generic fetch utility
    const result = await fetchApi<{ complete: string }>(
      `/transactions/build`,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(input),
      },
      'build unlock transaction'
    );
    
    return { complete: result.complete };
  } catch (error: unknown) {
    return { error: handleApiError('unlock funds', error) };
  }
}
```

### 2. Create the Unlock API Endpoint

Create an API endpoint for unlocking funds `src/app/api/escrow/unlock/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { unlockFunds } from '@/lib/anvil-api';
import { upsertWallet, upsertTx } from '@/lib/db';
import { TX_STATUS } from '@/lib/types';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { txHash, changeAddress, ownerKeyHash, amount } = body;

  if (!txHash || !changeAddress || !ownerKeyHash || amount == null) {
    return NextResponse.json(
      { error: 'Missing txHash, changeAddress, ownerKeyHash, or amount' },
      { status: 400 }
    );
  }

  try {
    const { complete, error } = await unlockFunds({ txHash, changeAddress, ownerKeyHash });
    if (error || !complete) {
      return NextResponse.json(
        { error: error || 'Failed to build unlock transaction' },
        { status: 500 }
      );
    }

    upsertWallet(changeAddress);
    upsertTx(txHash, changeAddress, Number(amount), TX_STATUS.PENDING);

    // Return built transaction for client-side signing and submission
    return NextResponse.json({ complete });
  } catch (err: unknown) {
    console.error('Error unlocking funds:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

```

### 3. Update the Submit Transaction Endpoint

Update the submit endpoint to handle unlock transactions. 
This is the updated `src/app/api/escrow/submit/route.ts` file:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { submitTransaction } from '@/lib/anvil-api';
import { updateTxStatus } from '@/lib/db';
import { TX_STATUS } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { complete, signature, type, originalTxHash } = body;
    
    // Validate inputs
    if (!complete || !signature || !(type === TX_STATUS.SIGN_LOCK || type === TX_STATUS.SIGN_UNLOCK)) {
      return NextResponse.json(
        { error: 'Missing complete transaction or signature' },
        { status: 400 }
      );
    }
    
    // For unlock transactions, originalTxHash is required
    if (type === TX_STATUS.SIGN_UNLOCK && !originalTxHash) {
      return NextResponse.json(
        { error: 'Missing originalTxHash for unlock transaction' },
        { status: 400 }
      );
    }

    // Submit the signed transaction to the blockchain
    const result = await submitTransaction(signature, complete);

    // Mark transaction as pending in DB
    // For lock transactions, update the new txHash
    // For unlock transactions, update the original txHash
    const txHashToUpdate = type === TX_STATUS.SIGN_UNLOCK ? originalTxHash : result.txHash;
    updateTxStatus(txHashToUpdate, type === TX_STATUS.SIGN_LOCK ? TX_STATUS.PENDING : TX_STATUS.UNLOCKED);

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

### 4. Update the Transaction Operations Hook

Update the transaction operations hook to include unlock functionality.
This is the updated `src/hooks/useTransactions.ts` file:

```typescript
"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Transaction, TransactionStatus, TX_STATUS } from '@/lib/types';
import { useCallback, useState, useEffect } from 'react';

/**
 * Hook to manage transaction data with smart polling that automatically
 * activates only when pending transactions are detected
 * @param wallet - Wallet address to fetch transactions for
 * @returns Transaction data with loading and error states
 */
export function usePollingTransactions(wallet?: string) {
  const [hasPendingTx, setHasPendingTx] = useState(false);
  
  const query = useQuery<Transaction[], Error>({
    queryKey: ['transactions', wallet],
    queryFn: async () => {
      if (!wallet) throw new Error("Wallet is required");
      const response = await fetch(`/api/escrow/transactions?wallet=${wallet}`);
      return response.json();
    },
    enabled: !!wallet,
    refetchInterval: wallet && hasPendingTx ? 5000 : false,
  });
  
  useEffect(() => {
    if (query.data) {
      const isPending = query.data.some(tx => tx.status === TX_STATUS.PENDING);
      if (isPending !== hasPendingTx) {
        setHasPendingTx(isPending);
      }
    }
  }, [query.data, hasPendingTx]);
  
  return query;
}

/**
 * Hook to update transaction status in the cache
 * @param wallet - Wallet address to update transactions for
 * @returns Function to update transaction status
 */
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

type CardanoWallet = {
  changeAddressHex?: string;
  handler?: {
    signTx: (txComplete: string, witnessOnly: boolean) => Promise<string>;
  };
};

/**
 * API response types
 */
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

/**
 * Hook to manage transaction operations (locking and unlocking funds)
 * @param wallet - The wallet instance from useWallet() from Weld
 * @param address - The wallet address to use for transactions
 * @returns Functions:
 * - lockFunds (/escrow/lock + Weld signTx + /escrow/submit): Lock funds in escrow
 * - unlockFunds (/escrow/unlock + Weld signTx + /escrow/submit): Unlock funds from escrow
 */
export function useTransactionOperations(wallet: CardanoWallet, address?: string) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateTransaction = useTransactionUpdater(address);

  const buildUnlockTransaction = async (txHash: string, amount: number) => {
    if (!address || !wallet?.changeAddressHex) return null;
    
    const data = await apiPost<BuildTransactionResponse>('unlock', {
      txHash,
      changeAddress: address,
      ownerKeyHash: wallet.changeAddressHex,
      amount
    });
    
    if (!data.complete) {
      throw new Error('Build failed');
    }
    
    return data.complete;
  };

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

  const signTransaction = async (txComplete: string): Promise<string> => {
    const signed = await wallet?.handler?.signTx(txComplete, true);
    if (!signed) {
      throw new Error('Signing failed');
    }
    return signed;
  };

  const submitUnlockTransaction = async (signed: string, txComplete: string, originalTxHash: string): Promise<TransactionResponse> => {
    return apiPost<TransactionResponse>('submit', {
      signature: signed,
      complete: txComplete,
      type: TX_STATUS.SIGN_UNLOCK,
      originalTxHash
    });
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
  
  const unlockFunds = async (txHash: string, amount: number) => {
    if (!address) return;
    
    setError(null);
    setProcessing(txHash);
    
    try {
      // Build → Sign → Submit pattern
      const txComplete = await buildUnlockTransaction(txHash, amount);
      if (!txComplete) throw new Error('Failed to build transaction');
      
      const signedTx = await signTransaction(txComplete);
      await submitUnlockTransaction(signedTx, txComplete, txHash);
      
      // Update transaction status in cache
      updateTransaction(txHash, TX_STATUS.UNLOCKED);
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
    unlockFunds,
    processing,
    error
  };
}
```

### 5. Update the MyTransactions Component

Finally, update the MyTransactions component `src/components/MyTransactions.tsx` to include unlock buttons for confirmed transactions:
 - Import the `useTransactionOperations` hook.
 - Add the Unlock Button to the table row. 
 - Add click handler function that uses `unlockFunds` from `useTransactionOperations` hook.
 - Add loading state for the unlock button.
 - Add error state for the unlock button.

 This is the updated MyTransactions component:

```typescript
"use client";

import { useWallet } from '@ada-anvil/weld/react';
import { usePollingTransactions, useTransactionOperations } from '@/hooks/useTransactions';
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
  
  const { data: transactions = [], error, isLoading } = usePollingTransactions(address);
  const { unlockFunds, processing: unlocking, error: unlockError } = useTransactionOperations(wallet, address);

  const handleUnlock = (txHash: string, amount: number) => {
    if (!address) return;
    unlockFunds(txHash, amount).catch(err => {
      console.debug('Transaction unlock error:', err);
    });
  };
  
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
          {/* Display any unlock errors */}
          {unlockError && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
              {unlockError}
            </div>
          )}
          
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
                        {/* Unlock button, only visible for confirmed transactions */}
                        {transaction.status === TX_STATUS.CONFIRMED ? (
                          <button
                            disabled={unlocking === transaction.txHash}
                            className="button-primary py-1 px-3 text-sm disabled:opacity-50"
                            onClick={() => handleUnlock(transaction.txHash, transaction.amount)}
                          >
                            {unlocking === transaction.txHash ? 'Unlocking…' : 'Unlock'}
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
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

## Security Features of the Unlocking Process

Several security measures are implemented in the unlocking process:

1. **Status Verification**: Only transactions in the CONFIRMED state can be unlocked

2. **Address Validation**: The transaction is validated against the owner's address

3. **Smart Contract Validation**: The escrow script verifies that the unlocking is performed by the original owner

## Testing the Complete Escrow Cycle

Let's test the full escrow cycle:

1. Start your development server:

```bash
npm run dev
```

2. Navigate to http://localhost:3000 in your browser

3. Connect your wallet

4. Lock funds using the lock funds form from Part 3

5. Wait for the transaction to be confirmed (You'll see the status change in the MyTransactions component)

6. Click the "Unlock Funds" button on the confirmed transaction

7. Sign the transaction with your wallet

8. Observe the transaction status changing to UNLOCKED

9. Verify that the funds have been returned to your wallet (minus network fees)

## Troubleshooting

### Transaction Not Unlockable

If you can't unlock a transaction:

1. Verify that the transaction status is CONFIRMED (only confirmed transactions can be unlocked)
2. Ensure you're using the same wallet that created the transaction
3. Check that the network has processed the original transaction (check explorers like cardanoscan.io)

### Signing Failures

If signing the unlock transaction fails:

1. Make sure your wallet is unlocked and connected
2. Check that your wallet has sufficient balance for the transaction fee
3. Try disconnecting and reconnecting your wallet

## Enhancements for a Production Application

For a production-ready escrow application, consider these enhancements:

1. **Time-locked Escrow**: Add support for time-based unlocking conditions

2. **Multi-signature Escrow**: Implement escrow that requires approval from multiple parties

3. **Improved Error Handling**: Add more detailed error messages and recovery options

4. **Transaction Monitoring**: Implement more robust transaction status monitoring

5. **Sign Lock/Unlock**: Add support for signing lock and unlock transactions after users leave the page.

6. **Enhanced Security**: Add additional verification steps for high-value transactions

{% hint style="success" %}
Congratulations! You've completed all six parts of the Cardano Smart Escrow guide. Your application now offers a complete escrow solution using the Cardano blockchain and Anvil API.
{% endhint %}

## Conclusion

In this guide series, you've built a fully functional Cardano smart escrow application that allows users to:

1. Connect their Cardano wallets
2. Lock funds in an escrow contract
3. Monitor transaction status in real-time
4. Unlock funds when they're ready

You've learned how to:

- Integrate with Cardano wallets using Weld
- Build and submit transactions using the Anvil API
- Store and track transaction data in a SQLite database
- Implement real-time updates with webhooks
- Create a complete fund locking and unlocking cycle

This application provides a foundation for building more complex Cardano applications that leverage smart contracts for secure and transparent financial interactions.

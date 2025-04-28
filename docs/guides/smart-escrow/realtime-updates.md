---
description: Enhance your Cardano smart escrow application with real-time transaction updates using Blockfrost webhooks and ngrok for local development.
---

# Part 5: Real-time Updates with Blockfrost

## Introduction

In this section, we'll enhance our transaction list by implementing real-time updates using Blockfrost webhooks. This will provide a much better user experience by showing immediate updates when transactions are confirmed on the blockchain.

{% success %}
Unlock Enterprise-Grade Blockchain Data Services with Anvil

While this tutorial uses Blockfrost webhooks for basic transaction monitoring, enterprise applications often require more sophisticated chain indexing solutions tailored to specific business needs.

Contact Anvil today (TODO: add link) to discuss your specific chain indexing requirements and elevate your blockchain application to enterprise standards.
{% endsuccess %}

## Webhook Overview

Webhooks provide a mechanism for receiving real-time notifications about blockchain events. Instead of constantly polling for transaction confirmation updates, our application will receive instant notifications when transactions are confirmed on the Cardano blockchain.

Our hybrid approach uses:
1. **Initial polling**: For pending transactions when they're first created
2. **Webhooks**: For confirmation notifications when the blockchain confirms transactions

Key advantages of this hybrid approach:

- **Real-time Updates**: Instant notifications when transactions are confirmed, without waiting for the next poll cycle
- **Reduced API Usage**: Significantly fewer polling requests compared to a pure polling solution
- **Better User Experience**: More immediate UI updates for confirmed transactions
- **Server Resource Efficiency**: Lower overall load on both client and server

## Implementation Steps

### 1. Setting Up Blockfrost

1. Create a Blockfrost account at [blockfrost.io](https://blockfrost.io/)
2. Navigate to the Webhooks section in your Blockfrost dashboard
3. Click the 'Create webhook' button to create a new webhook

### 2. Configuring Your Blockfrost Webhook

After setting up ngrok (in the next section), return to Blockfrost and configure your webhook with these settings:

1. **Webhook name**: Give it a descriptive name (e.g., 'smart-escrow-lock-trigger-ngrok')
2. **Endpoint URL**: Enter your ngrok URL followed by your webhook endpoint path (e.g., 'https://your-ngrok-url.ngrok-free.app/api/webhook/blockfrost')
3. **Network**: Select 'Cardano preprod' for testnet development
4. **Status**: Ensure it's enabled
5. **Trigger**: Select 'Transaction'
6. **Required confirmations**: Set to your desired confirmation threshold (typically 1-3 for testing)
7. **Trigger conditions**:
   - Set condition type to 'recipient'
   - Set operator to 'equal to'
   - Enter your escrow script address (this can be found in the script deployment data or derived from the validator hash using the Anvil API)

{% info %}
**Deriving Script Address**: You can derive the script address from your validator hash using the Anvil API endpoint `/validators/{hash}/address`. For more details, see the [Anvil API Documentation](TODO: Add link to Anvil API documentation section for utils).
{% endinfo %}
8. Click 'Save webhook' to finalize the configuration

> **Important**: Save the 'Auth token' provided by Blockfrost, and update your local `.env.local` file with your `BLOCKFROST_WEBHOOK_SECRET`.

### 3. Install and Configure ngrok

Since Blockfrost webhooks require a public URL to send notifications to, we'll use ngrok to expose our local development server.

#### Installing ngrok

1. Sign up for a free ngrok account at [dashboard.ngrok.com](https://dashboard.ngrok.com/)

2. Install ngrok using npm:

```bash
npm install -g ngrok
```

{% info %}
**Windows Defender Warning**: Windows users may encounter Microsoft Defender flagging ngrok as potentially unwanted software or even as a trojan (with names like Trojan:Script/Wacatac.B!ml or similar). This is a known false positive due to ngrok's tunneling functionality, which security software sometimes flags because tunneling can be misused by malware. However, ngrok is a legitimate tool used by developers worldwide.

If you encounter this warning:
1. You can select 'Allow on device' in Windows Defender
2. You may need to temporarily disable real-time protection to complete the installation
3. Once allowed you will need to run the `npm install -g ngrok` command again
{% endinfo %}

3. Configure ngrok with your auth token (found in your ngrok dashboard):

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

4. Start your Next.js development server if it's not already running:

```bash
npm run dev
```

5. In a separate terminal, start ngrok to expose your local server using one of these methods:

**Option A: Using global installation** (if it was properly added to PATH)
```bash
ngrok http 3000
```

**Option B: Using npx** (more reliable, works even if PATH is not set)
```bash
npx ngrok http 3000
```

{% info %}
**Note about PATH issues**: If you installed ngrok globally but get 'ngrok is not recognized' errors, the executable wasn't added to your PATH. This can happen due to Windows security features or installation issues. Using `npx ngrok` is a reliable alternative that bypasses PATH problems.
{% endinfo %}

#### After Starting ngrok

1. Once ngrok is running, you'll see a terminal display with connection information

2. Look for the 'Forwarding' URL that looks like `https://xxxx-xxx-xxx-xxx-xxx.ngrok-free.app`

3. Copy this URL - you'll need it for configuring your Blockfrost webhook

4. Keep this terminal window open as long as you need the tunnel active

{% info %}
**Update Blockfrost Webhook URL when restarting ngrok**: The free tier of ngrok generates a new URL each time you restart it. For development purposes, you'll need to update your Blockfrost webhook URL whenever you restart ngrok.
{% endinfo %}

### 4. Create the Webhook Endpoint

Let's create the webhook endpoint `src/app/api/webhooks/blockfrost/route.ts` that will receive notifications from Blockfrost:

```typescript
// src/app/api/webhooks/blockfrost/route.ts
import { NextResponse } from "next/server";
import { upsertWallet, upsertTx } from "@/lib/db";
import { TX_STATUS } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    for (const event of body.payload) {
      const wallet = event.inputs?.[0]?.address;
      const txHash = event.tx.hash;
      const amount = event.outputs?.[0]?.amount.find(
        (a: { unit: string; quantity: string }) => a.unit === "lovelace"
      )?.quantity;
      if (wallet && amount) {
        upsertWallet(wallet);
        upsertTx(txHash, wallet, Number(amount), TX_STATUS.CONFIRMED);
      }
    }
  } catch (err) {
    console.error("Failed to handle webhook:", err);
  }
  return NextResponse.json({ ok: true });
}
```

### 5. Update Your BlockfrostWebhook URL

Now that your webhook endpoint is set up and ngrok is running:

1. Return to the Blockfrost dashboard
2. Update your webhook with the new ngrok URL: `https://[your-ngrok-url]/api/webhooks/blockfrost`
3. Make sure you press 'Save Webhook' to save the changes

### 6. Webhook Payload Structure

Blockfrost will send notifications with a payload structure like this:

```json
{
  "id": "webhook-id",
  "webhook_id": "your-webhook-id",
  "created": 1625558414,
  "api_version": 0,
  "type": "transaction",
  "payload": [
    {
      "tx": {
        "hash": "transaction_hash_here"
      },
      "inputs": [
        {
          "address": "wallet_address_here"
        }
      ],
      "outputs": [
        {
          "amount": [
            {
              "unit": "lovelace",
              "quantity": "amount_in_lovelace"
            }
          ]
        }
      ]
    }
  ]
}
```

### 7. Smart Polling Implementation

Let's implement a smart polling mechanism in `src/hooks/useTransactions.ts` that only activates when there are pending transactions. This approach conserves resources while still providing timely updates:

Add the React `useEffect` hook and the `usePollingTransactions` hook to the `useTransactions` hook:

```typescript
// src/hooks/useTransactions.ts

// Import React useEffect hook
import { useEffect, useState } from "react";

/**
 * Hook to manage transaction data with smart polling that automatically
 * activates only when pending transactions are detected
 * @param wallet - Wallet address to fetch transactions for
 * @returns Transaction data with loading and error states
 */
export function usePollingTransactions(wallet?: string) {
  // Track if we have any pending transactions that need polling
  const [hasPendingTx, setHasPendingTx] = useState(false);
  
  const query = useQuery<Transaction[], Error>({
    queryKey: ['transactions', wallet],
    queryFn: async () => {
      if (!wallet) throw new Error("Wallet is required");
      const response = await fetch(`/api/escrow/transactions?wallet=${wallet}`);
      return response.json();
    },
    enabled: !!wallet,
    // Only activate polling when wallet is connected AND we have pending transactions
    refetchInterval: wallet && hasPendingTx ? 5000 : false,
  });
  
  // Monitor transaction data for pending status changes
  useEffect(() => {
    if (query.data) {
      // Check if any transactions have PENDING status
      const isPending = query.data.some(tx => tx.status === TX_STATUS.PENDING);
      
      // Only update state if the pending status changed
      // This prevents unnecessary re-renders
      if (isPending !== hasPendingTx) {
        setHasPendingTx(isPending);
      }
    }
  }, [query.data, hasPendingTx]);
  
  return query;
}
```

### 7. Update MyTransactions Component

Finally, we need to update our `MyTransactions` component `src/components/MyTransactions.tsx` to use the new polling hook instead of the regular transactions hook:

```tsx
// src/components/MyTransactions.tsx
"use client";

// Update this import to use the new polling hook instead
import { usePollingTransactions } from '@/hooks/useTransactions';
import { useWallet } from '@ada-anvil/weld/react';
import { Transaction, TransactionStatus, TX_STATUS } from '@/lib/types';

// Rest of component code remains the same...

export default function MyTransactions() {
  const wallet = useWallet();
  const address = wallet.changeAddressBech32;
  
  // Replace useTransactionsByWallet with usePollingTransactions
  const { data: transactions = [], error, isLoading } = usePollingTransactions(address);
  
  // Rest of component remains the same...
}
```

This change enables smart polling that automatically activates when there are pending transactions, and disables when all transactions are confirmed, providing real-time updates while conserving resources.

### 8. Test the Webhook Integration

Let's test the complete flow with webhooks:

1. Ensure your Next.js server is running
2. Verify ngrok is properly exposing your local server
3. Check that the Blockfrost webhook is configured and enabled
4. Connect your wallet in the application
5. Lock some funds using the Lock Funds form
6. Observe how the transaction initially shows as "Pending"
7. Wait for Blockfrost to detect the transaction confirmation and send a webhook
8. Verify that the transaction status updates to "Confirmed" immediately after the webhook is received

## Understanding the Webhook Flow

The complete flow with webhooks works as follows:

1. **Transaction Creation**: User locks funds, creating a transaction
2. **Initial Status**: Transaction is stored with "PENDING" status
3. **Initial Polling**: UI polls frequently at first to provide responsive feedback
4. **Blockchain Confirmation**: Transaction is confirmed on the Cardano blockchain
5. **Webhook Notification**: Blockfrost detects the confirmation and sends a webhook
6. **Status Update**: Our webhook handler updates the transaction status to "CONFIRMED"
7. **UI Update**: The next poll or React Query invalidation refreshes the UI

This hybrid approach combines the best of both worlds:
- Immediate feedback through initial polling
- Reliable long-term updates through webhooks
- Fallback to extended polling for resilience

## Monitoring Webhook Activity

To help troubleshoot and verify webhook activity, let's add some simple logging:

```typescript
// src/app/api/webhooks/blockfrost/route.ts
// Add this to the existing file

// Add at the top of the POST function
console.log(`Received webhook at ${new Date().toISOString()}`);

// Add inside the try block after processing
console.log(`Processed ${body.payload.length} webhook events`);

// Add inside the catch block
console.error("Webhook error details:", JSON.stringify(err));
```

## Webhook Security Considerations

In a production environment, you would want to add security to your webhook endpoint:

1. **Webhook Secrets**: Use a shared secret with Blockfrost to verify webhook authenticity
2. **IP Filtering**: Restrict access to known Blockfrost IP addresses
3. **Rate Limiting**: Protect against DoS attacks by implementing rate limiting
4. **Request Validation**: Validate the webhook payload structure before processing

For our tutorial, we've kept it simple, but consider these enhancements for production use.

## Benefits of Real-time Updates

With the webhook implementation, users will experience:

1. **Immediate Feedback**: Transaction status changes are reflected immediately
2. **Reduced Network Traffic**: No need for constant polling requests
3. **Better Battery Life**: Mobile devices benefit from fewer background requests
4. **More Responsive UI**: Status changes happen in near real-time

## Troubleshooting

### Webhook Not Receiving Events

If your webhook isn't receiving events:

1. Check ngrok status - ensure the tunnel is active
2. Verify your webhook URL in the Blockfrost dashboard
3. Check Blockfrost webhook logs for delivery attempts
4. Ensure your application is properly handling POST requests

### Inconsistent Status Updates

If transaction statuses are not updating correctly:

1. Enable detailed logging in your webhook handler
2. Verify the transaction hash matching in your database operations
3. Check that the database is successfully updated when webhooks are received

{% hint style="info" %}
During development, Blockfrost may take a few minutes to start sending webhooks for newly configured endpoints. Be patient during initial testing.
{% endhint %}

## Best Practices for Webhook Implementation

1. **Idempotency**: Ensure your webhook handler can safely process the same event multiple times
2. **Async Processing**: For high-volume applications, consider processing webhooks asynchronously
3. **Monitoring**: Implement logging and monitoring to track webhook health
4. **Fallback Strategy**: Always maintain a fallback mechanism (like polling) for resilience

{% hint style="success" %}
Congratulations! You've completed Part 5 of the guide. Your application now receives real-time updates when transactions are confirmed on the blockchain, providing a much better user experience.
{% endhint %}
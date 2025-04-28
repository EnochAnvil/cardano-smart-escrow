---
description: Implement wallet connectivity using the Weld library to allow users to connect their Cardano wallets to the application.
---

# Part 2: Wallet Integration

## Introduction

In this part, we'll implement wallet connectivity using [Weld](https://github.com/Cardano-Forge/weld), a universal wallet connector library that provides a simple, consistent interface for connecting to Cardano wallets. Weld handles all the complexity of wallet discovery, connection management, and state persistence, allowing our application to interact with various wallet providers (Eternl, Lace, etc.) through a single API.

## Implementation Steps

### 1. Create the Weld Provider

First, let's create a provider component that will initialize the Weld library and make wallet functionality available throughout our application `src/components/WeldProvider.tsx`:

```tsx
// src/components/WeldProvider.tsx
"use client";

import { WeldProvider, type WeldProviderProps } from "@ada-anvil/weld/react";

export function ClientWeldProvider({
  children,
  lastConnectedWallet,
}: {
  children: React.ReactNode;
  lastConnectedWallet?: NonNullable<
    WeldProviderProps["wallet"]
  >["tryToReconnectTo"];
}) {
  return (
    <WeldProvider
      updateInterval={30_000} // 30 seconds
      wallet={{ tryToReconnectTo: lastConnectedWallet }} // Restore wallet connection state
    >
      {children}
    </WeldProvider>
  );
}
```

### 2. Update Root Layout

Now we need to update the root layout to include our Weld provider `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ClientWeldProvider } from "@/components/WeldProvider";
import { cookies } from "next/headers";
import { STORAGE_KEYS } from "@ada-anvil/weld/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cardano Smart Escrow",
  description: "Smart escrow solution for Cardano blockchain",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Retrieve wallet connection state from cookies for SSR
  const cookieStore = await cookies();
  const wallet = cookieStore.get(STORAGE_KEYS.connectedWallet)?.value;
  const changeAddress = cookieStore.get(STORAGE_KEYS.connectedChange)?.value;
  const stakeAddress = cookieStore.get(STORAGE_KEYS.connectedStake)?.value;
  const lastConnectedWallet = wallet ? { wallet, changeAddress, stakeAddress } : undefined;

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white`}>
        <ClientWeldProvider lastConnectedWallet={lastConnectedWallet}>
          {children}
        </ClientWeldProvider>
      </body>
    </html>
  );
}

```

### 3. Create the Wallet Connector Component

Now, let's create a component for users to connect their wallets. It will:

1. Use Weld's `useWallet` hook to interact with the user's wallet
2. Display a connect button when no wallet is connected
3. Show wallet information (address and balance) when connected
4. Provide a disconnect button for connected wallets
5. Format the wallet's lovelace balance to show readable ADA amounts

Create the `WalletConnector` component `src/components/WalletConnector.tsx`:

```tsx
// src/components/WalletConnector.tsx
"use client";

import { useWallet, useExtensions } from "@ada-anvil/weld/react";
import { SUPPORTED_WALLETS } from "@ada-anvil/weld";
import { useState } from "react";

// Component to display wallet information
const WalletInfo = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline">
    <span className="text-gray-700 mr-2">{label}</span>
    <span className="font-semibold break-all text-black">{value}</span>
  </div>
);

// Format wallet address to show abbreviated form
const formatAddress = (address?: string) => {
  if (!address) return "";
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
};

/**
 * WalletConnector component handles wallet connection functionality
 * - Detects available Cardano wallets
 * - Allows users to connect/disconnect their wallet
 * - Displays wallet information when connected
 */
export default function WalletConnector() {
  const wallet = useWallet();
  const { supportedMap: installedWallets, isLoading } = useExtensions(
    "supportedMap",
    "isLoading"
  );

  // Filter to only show available wallets that are installed
  const availableWallets = SUPPORTED_WALLETS.filter((w) =>
    installedWallets.has(w.key),
  );

  const [selectedWallet, setSelectedWallet] = useState<string>("");

  // Handle wallet selection from dropdown
  const handleWalletSelection = (walletKey: string) => {
    setSelectedWallet(walletKey);
  };

  // Connect to selected wallet
  const handleConnect = async (walletKey?: string) => {
    if (!walletKey) return;
    try {
      await wallet.connectAsync(walletKey);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  return (
    <section className="section-card">
      <h2 className="text-xl font-bold mb-4 text-black">Wallet</h2>

      {wallet.isConnected ? (
        // Connected state - show wallet info and disconnect button
        <>
          <WalletInfo label="Connected to:" value={wallet.displayName || ""} />
          <WalletInfo
            label="Address:"
            value={formatAddress(wallet.changeAddressBech32)}
          />
          <WalletInfo
            label="Balance:"
            value={`${wallet.balanceAda?.toFixed(2) || "0.00"} ADA`}
          />

          <button
            onClick={() =>
              wallet
                .disconnect()
                .catch((err) =>
                  console.error("Failed to disconnect wallet:", err)
                )
            }
            className="button-primary"
          >
            Disconnect
          </button>
        </>
      ) : isLoading ? (
        // Loading state
        <div className="text-gray-700">Detecting wallet extensions...</div>
      ) : (
        // Disconnected state - show wallet selector and connect button
        <div>
          <select
            className="w-full p-2 border-2 border-neutral-800 rounded-2xl mb-4 focus:outline-none bg-white text-black"
            name="wallet-key"
            value={selectedWallet}
            onChange={(e) => handleWalletSelection(e.target.value)}
          >
            {availableWallets.length === 0 ? (
              <option value="">No wallets installed</option>
            ) : (
              <>
                <option value="">Select a wallet</option>
                {availableWallets.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.displayName}
                  </option>
                ))}
              </>
            )}
          </select>
          
          <button
            onClick={() => selectedWallet && handleConnect(selectedWallet)}
            className="button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={wallet.isConnecting || availableWallets.length === 0}
          >
            {wallet.isConnecting
              ? `Connecting to ${wallet.isConnectingTo}...`
              : selectedWallet
                ? "Connect Wallet"
                : "Select a Wallet"}
          </button>
        </div>
      )}
    </section>
  );
}
```

### 3. Update Home Page

Update the home page to include the wallet connector component `src/app/page.tsx`:

```tsx
// src/app/page.tsx
import WalletConnector from "@/components/WalletConnector";

export default function Page() {
  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 text-black">Cardano Smart Escrow</h1>
      <WalletConnector />
    </main>
  );
}
```

## Understanding Weld Integration

### The Weld Provider

The `WeldProvider` component creates a reactive context that makes wallet functionality available throughout your application:

- **Universal API**: Provides a consistent interface regardless of wallet implementation
- **Network Configuration**: Automatically configures for testnet (preview/preprod) or mainnet
- **State Management**: Handles connection state and persistence across page refreshes

### The useWallet Hook

The `useWallet` hook exposes wallet functionality with smart TypeScript type inference:

- **Connection State**: `isConnected` works as a type guard for other properties
- **Wallet Data**: Access addresses, balances, and wallet metadata
- **Actions**: Methods for connecting, disconnecting, and signing transactions
- **Reactive Updates**: Properties update automatically when wallet state changes

### Key Concepts

- **Wallet Discovery**: Weld detects all CIP-30 compatible wallets installed in the browser
- **Address Formats**: Works with Bech32 addresses (human-readable format starting with `addr_`)
- **Balance Units**: Converts between lovelace (smallest unit) and ADA (1 ADA = 1,000,000 lovelace)
- **Connection Persistence**: Maintains wallet connection across page reloads

## Testing Your Wallet Integration

To test your wallet integration:

1. Start your development server:
```bash
npm run dev
```

2. Visit http://localhost:3000 in your browser

3. Make sure you have a CIP-30 compatible wallet extension installed
   - Fully-tested wallets include: Eternl, Lace, Flint, GeroWallet, Typhon, and Vespr

4. Click the "Connect Wallet" button

5. Select your wallet from the popup and approve the connection

6. Verify that your address and balance are displayed correctly

## Troubleshooting

### Wallet Not Detected

If your wallet isn't detected:

- Verify the wallet extension is installed, unlocked and refreshed after installation
- Confirm that your wallet implements the CIP-30 standard
- Try clearing browser cache or restarting your browser

### Network Mismatch

If you see connection errors:

- Ensure your wallet is set to the same network as your application (Preview/Preprod)
- Remember that wallets require explicit testnet mode activation
- Check the wallet's network selector in its settings menu

{% hint style="info" %}
For development, you'll need to enable testnet mode in your wallet. This is typically found in the wallet's settings or network preferences.
{% endhint %}

{% hint style="success" %}
Congratulations! You've completed Part 2 of the guide. Your application can now connect to Cardano wallets and display the user's address and balance.
{% endhint %}

## What's Next?

In [Part 3: Fund Locking](./fund-locking.md), we'll implement the functionality to lock funds in an escrow contract using the Anvil API.

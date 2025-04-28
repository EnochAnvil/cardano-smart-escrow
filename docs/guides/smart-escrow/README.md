---
description: Build a Cardano smart escrow application with wallet connectivity, fund locking and unlocking, and transaction monitoring
---

# Cardano Smart Escrow Guide

## Introduction

This guide walks you through building a **Cardano smart escrow application** using Next.js and the Weld wallet connector. You'll create a web application that demonstrates the practical application of Cardano smart contracts through a real-world escrow use case.

//Add image here of the completed application. (maybe a gif?)

## User Journey Through Smart Contract Interaction

This application demonstrates the complete lifecycle of smart contract interaction on Cardano:

1. **Connect Wallet**: Users connect their Cardano wallet to establish their blockchain identity
2. **Lock Funds**: Users lock ADA in a smart contract, specifying themselves as the future recipient
3. **Monitor Status**: Users track the status of their locked funds in real-time
4. **Unlock Funds**: When ready, users reclaim their funds by meeting the contract's conditions

Through this process, users experience firsthand how Cardano's eUTXO model and validator scripts work together to create secure, programmable transactions.

## Real-World Applications

The principles demonstrated in this escrow application can be extended to build a variety of real-world solutions:

- **Marketplace Escrow**: Hold buyer funds until the seller confirms delivery of goods or services
- **Rental Security Deposits**: Lock tenants' deposits and release after lease terms are met
- **Milestone Payments**: Release funds to contractors upon completion of deliverables
- **Token Vesting**: Gradually unlock tokens to team members based on a schedule
- **Shared Savings**: Create group savings where funds unlock only when a goal is reached

## The Smart Escrow Contract

### What You'll Build

With the Cardano Smart Escrow application, users can:

- Connect any [Weld](https://github.com/Cardano-Forge/weld) supported Cardano wallet (Eternl, Lace, etc.)
- Lock ADA at a script address with owner information stored in the datum
- Monitor transaction status in real-time
- Unlock funds when ready
  - Signature verification ensures only the rightful owner can access funds
  - Use the special message from your redeemer ("Hello, World!") to unlock funds. This message is required by the smart contract in order to spend the locked funds.

### Smart Contract Overview

This application uses a Hello World smart contract to create a secure escrow by enforcing two simple conditions:

1. The transaction must include the specific message "Hello, World!" in the `redeemer` field
2. The transaction must be signed by the owner's key specified in the `datum`

When both conditions are met, the validator returns `true` and the locked funds can be spent.

<details>
<summary>Expand for technical details about the Smart Contract</summary>

#### How Cardano Validators Work

At their core, all Cardano validators function as boolean predicates - they evaluate to either `True` or `False`. A UTXO can only be spent when its validator returns `True`. If the validator returns `False` or fails with an error, the transaction is rejected.

Thanks to Cardano's smart contract model, this simple Hello World contract can be repurposed for a secure escrow application. As long as our validator returns true because the conditions are met, our transaction will be accepted by the network and the funds will be unlocked.

#### Contract Implementation

```aiken
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction}

pub type Datum {
  owner: VerificationKeyHash,
}

pub type Redeemer {
  msg: ByteArray,
}

validator hello_aiken {
  spend(
    datum: Option<Datum>,
    redeemer: Redeemer,
    _own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(Datum { owner }) = datum

    // Condition 1: Check if message matches
    let must_say_hello = redeemer.msg == "Hello, World!"

    // Condition 2: Check if signed by owner
    let must_be_signed = list.has(self.extra_signatories, owner)

    // Both conditions must be true (boolean AND)
    must_say_hello && must_be_signed
  }

  else(_) {
    fail
  }
}
```

#### Key Technical Concepts

Cardano's smart contracts operate through three essential components:

1. **Validator Script**: The on-chain logic that determines when funds can be spent (in our case, the deployed Hello World smart contract)
2. **Datum**: Data attached to UTXOs when funds are locked (in our case, the owner's public key hash)
3. **Redeemer**: Transaction-specific data provided when attempting to spend a UTXO (our "Hello, World!" message)

The validator hash from the deployed smart contract is stored as `ESCROW_VALIDATOR_HASH` in the application's environment variables and used to:

- Create the script address where funds are locked
- Identify the correct validator during transaction building
- Verify that funds are being spent from the correct contract

Refer to the [Smart Contract Overview](../../anvil-api/docs/guides/smart-contract/README.md) and [Blueprint Management Guide](../../anvil-api/docs/guides/smart-contract/blueprint-management.md) for more details on deploying your own smart contracts.
</details>

## Building the Application

### Prerequisites

Before starting, ensure you have:

- Node.js 18+ installed
- Basic familiarity with React and Next.js
- A Cardano wallet with testnet ADA (Eternl, Lace, etc.)
- An Anvil API key (for transaction building and submission)
- A deployed Hello World smart contract with the validator hash ([see Blueprint Management Guide](../../anvil-api/docs/guides/smart-contract/blueprint-management.md))

### Step-by-Step Guide

This tutorial is divided into six progressive modules, each focusing on a specific aspect of the escrow application:

1. **[Project Setup](./setup.md)**
   - Initialize a Next.js project
   - Set up essential dependencies and project structure

2. **[Wallet Integration](./wallet-integration.md)**
   - Connect to Cardano wallets using the Weld library
   - Implement wallet connection and state management

3. **[Fund Locking](./fund-locking.md)**
   - Create the interface to lock funds in the smart contract
   - Build and submit lock transactions via Anvil API

4. **[Transaction Dashboard](./transaction-dashboard.md)**
   - Develop a dashboard to monitor transaction status
   - Implement transaction history storage and retrieval

5. **[Real-time Updates](./realtime-updates.md)**
   - Add real-time Cardano monitoring through webhooks
   - Update transaction status as blockchain state changes

6. **[Fund Unlocking](./fund-unlocking.md)**
   - Implement the unlock functionality to complete the escrow cycle
   - Create the redeemer with the specific message and handle signing

### Best Practices

- **Security**: Never expose API keys or private credentials in client-side code
- **Testing**: Always test your application on testnet before deploying to mainnet
- **Error Handling**: Implement comprehensive error handling for all blockchain operations
- **Units**: Remember that 1 ADA = 1,000,000 Lovelace when calculating amounts

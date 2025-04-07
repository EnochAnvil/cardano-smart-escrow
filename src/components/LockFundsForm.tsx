"use client";

import { useState } from 'react';
import { useWallet } from '@ada-anvil/weld/react';
import { useAmountSlider } from '@/hooks/useAmountSlider';

export default function LockFundsForm() {
  const wallet = useWallet();
  const [isLocking, setIsLocking] = useState(false);
  
  const { 
    amount, 
    maxAmount, 
    handleAmountChange, 
    handleInputChange,
    getSliderBackground,
    isWalletConnected
  } = useAmountSlider({ wallet });
  
  // Handle lock button click
  const handleLock = async () => {
    if (!isWalletConnected || amount <= 0) return;
    
    setIsLocking(true);
    
    try {
      // This is where we'll add the actual locking functionality later
      console.log(`Locking ${amount} ADA`);
      
      // Simulate a delay for now
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Success message would go here
    } catch (error) {
      console.error('Failed to lock funds:', error);
      // Error handling would go here
    } finally {
      setIsLocking(false);
    }
  };
  
  return (
    <section className="section-card">
      <h2 className="text-xl font-bold mb-4 text-black">Lock Funds</h2>
      
      <div className="mb-6">
        <label htmlFor="amount-slider" className="block text-sm font-medium text-gray-700 mb-2">
          Amount to Lock (ADA)
        </label>
        
        {/* Slider */}
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
                background: getSliderBackground()
              }}
            />
          </div>
          
          {/* Number Input */}
          <div className="relative w-24">
            <input
              type="number"
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
        
        {/* Available Balance */}
        <p className="mt-1 text-sm text-gray-500">
          {isWalletConnected 
            ? `Available: ${wallet.balanceAda?.toFixed(2) || '0.00'} ADA` 
            : 'Connect wallet to lock funds'}
        </p>
      </div>
      
      <button
        onClick={handleLock}
        disabled={!isWalletConnected || isLocking || amount <= 0}
        className="button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLocking ? 'Locking...' : 'Lock Funds'}
      </button>
    </section>
  );
}

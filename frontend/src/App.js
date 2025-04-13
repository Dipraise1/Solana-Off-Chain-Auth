import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function App() {
  const { publicKey, signMessage } = useWallet();
  
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState(1);
  const [nonce, setNonce] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  
  // Generate a new nonce when the component mounts or when the wallet changes
  useEffect(() => {
    if (publicKey) {
      // Generate a nonce based on timestamp for simplicity
      const newNonce = Date.now();
      setNonce(newNonce);
    }
  }, [publicKey]);
  
  const handleSignAndSend = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    
    try {
      if (!publicKey || !signMessage) {
        throw new Error('Wallet not connected or does not support message signing');
      }
      
      // Create the full message to sign
      const fullMessage = `Transfer: ${amount} tokens\nNonce: ${nonce}`;
      
      // Convert the message to bytes and sign it
      const messageBytes = new TextEncoder().encode(fullMessage);
      const signature = await signMessage(messageBytes);
      
      // Convert the signature to base58 for sending to the backend
      const bs58 = await import('bs58');
      const signatureBase58 = bs58.default.encode(signature);
      
      // Prepare the data to send to the backend
      const data = {
        signer: publicKey.toString(),
        message: fullMessage,
        signature: signatureBase58,
        nonce: parseInt(nonce),
        amount: parseInt(amount),
      };
      
      // Send the signed message to the backend
      const response = await axios.post(`${BACKEND_URL}/api/store-signed-message`, data);
      
      setResult(response.data);
    } catch (err) {
      console.error('Error signing and sending message:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="app-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h1>Solana Off-Chain Message Signing</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <WalletMultiButton />
      </div>
      
      {publicKey ? (
        <div>
          <p>Connected: {publicKey.toString()}</p>
          
          <form onSubmit={handleSignAndSend} style={{ marginTop: '20px' }}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Message (optional):
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optional message"
                  style={{ width: '100%', padding: '8px' }}
                />
              </label>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Amount (tokens):
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                  required
                  style={{ width: '100%', padding: '8px' }}
                />
              </label>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                Nonce:
                <input
                  type="text"
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  readOnly
                  style={{ width: '100%', padding: '8px', backgroundColor: '#f0f0f0' }}
                />
              </label>
            </div>
            
            <button
              type="submit"
              disabled={loading || !publicKey}
              style={{
                background: '#512da8',
                color: 'white',
                border: 'none',
                padding: '10px 15px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              {loading ? 'Processing...' : 'Sign & Send Message'}
            </button>
          </form>
          
          {error && (
            <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px' }}>
              Error: {error}
            </div>
          )}
          
          {result && (
            <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#e8f5e9', color: '#2e7d32', borderRadius: '4px' }}>
              <h3>Success!</h3>
              <p>Your signed message has been stored.</p>
              <p>ID: {result.id}</p>
              <p>This message will be processed by the backend and submitted to the Solana program.</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
          <p>Connect your wallet to sign messages and authorize token transfers.</p>
        </div>
      )}
    </div>
  );
}

export default App; 
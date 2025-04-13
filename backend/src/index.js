const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/solana-offchain-auth')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define the SignedMessage schema
const SignedMessageSchema = new mongoose.Schema({
  signer: String,
  message: String,
  signature: String,
  nonce: Number,
  amount: Number,
  executed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Create the model
const SignedMessage = mongoose.model('SignedMessage', SignedMessageSchema);

// Verify a Solana signature
const verifySignature = (message, signature, publicKey) => {
  try {
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    const signatureBytes = bs58.decode(signature);
    const messageBytes = Buffer.from(message);
    
    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

// API Routes

// Store a signed message
app.post('/api/store-signed-message', async (req, res) => {
  try {
    const { signer, message, signature, nonce, amount } = req.body;
    
    // Verify the signature
    const isValid = verifySignature(message, signature, signer);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    
    // Check if the nonce has been used by this signer
    const existingMessage = await SignedMessage.findOne({ signer, nonce });
    if (existingMessage) {
      return res.status(400).json({ error: 'Nonce already used' });
    }
    
    // Store the signed message
    const signedMessage = new SignedMessage({
      signer,
      message,
      signature,
      nonce,
      amount
    });
    
    await signedMessage.save();
    
    res.status(201).json({ 
      success: true, 
      id: signedMessage._id,
      message: 'Signed message stored successfully' 
    });
  } catch (error) {
    console.error('Error storing message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pending signed messages
app.get('/api/pending-messages', async (req, res) => {
  try {
    const pendingMessages = await SignedMessage.find({ executed: false });
    res.json(pendingMessages);
  } catch (error) {
    console.error('Error fetching pending messages:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark a message as executed
app.post('/api/mark-executed/:id', async (req, res) => {
  try {
    const message = await SignedMessage.findByIdAndUpdate(
      req.params.id,
      { executed: true },
      { new: true }
    );
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.json({ success: true, message });
  } catch (error) {
    console.error('Error marking message as executed:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
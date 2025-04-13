const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
} = require('@solana/web3.js');
const { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress 
} = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');
require('dotenv').config();

// Connect to the Solana network
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Load the admin's keypair from a file
const loadAdminKeypair = () => {
  try {
    const secretKeyString = process.env.ADMIN_PRIVATE_KEY;
    
    // If the env variable points to a file
    if (secretKeyString.endsWith('.json')) {
      try {
        const fs = require('fs');
        const keypairData = JSON.parse(fs.readFileSync(secretKeyString, 'utf8'));
        return Keypair.fromSecretKey(Uint8Array.from(keypairData));
      } catch (err) {
        console.log(`Error loading from ${secretKeyString}, trying ./admin-keypair.json`);
        const keypairData = JSON.parse(fs.readFileSync('./admin-keypair.json', 'utf8'));
        return Keypair.fromSecretKey(Uint8Array.from(keypairData));
      }
    }
    
    // If it's a base58 encoded private key
    const secretKey = bs58.decode(secretKeyString);
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('Error loading admin keypair:', error);
    throw error;
  }
};

// Function to ensure the nonce account exists
const ensureNonceAccount = async (adminKeypair, signerPubkey, programId) => {
  try {
    // Get the nonce account PDA
    const nonceAccountSeed = Buffer.from('nonce_account');
    const [nonceAccountPda] = await PublicKey.findProgramAddress(
      [nonceAccountSeed, signerPubkey.toBuffer()],
      programId
    );
    
    // Check if the account exists
    const accountInfo = await connection.getAccountInfo(nonceAccountPda);
    
    if (!accountInfo) {
      console.log('Nonce account does not exist. Creating...');
      
      // Create instruction to initialize nonce account
      const instructionData = Buffer.from([1]); // 1 for initialize_nonce_account instruction
      
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: nonceAccountPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId,
        data: instructionData,
      });
      
      // Create and send the transaction
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = adminKeypair.publicKey;
      
      const initSignature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [adminKeypair]
      );
      
      console.log('Nonce account created with signature:', initSignature);
    } else {
      console.log('Nonce account already exists');
    }
    
    return nonceAccountPda;
  } catch (error) {
    console.error('Error ensuring nonce account:', error);
    throw error;
  }
};

// Function to send a signed message to the Solana program
const sendSignedMessageToProgram = async (signedMessageData) => {
  try {
    const {
      signer,
      message,
      signature: userSignature,
      nonce,
      amount,
    } = signedMessageData;

    // Get the admin keypair
    const adminKeypair = loadAdminKeypair();
    
    // Program ID for the Solana program
    const programId = new PublicKey(process.env.PROGRAM_ID);
    
    // Convert the signer pubkey string to a PublicKey object
    const signerPubkey = new PublicKey(signer);
    
    // Get the token mint address
    const tokenMint = new PublicKey(process.env.TOKEN_MINT);
    
    // Get the associated token accounts for the signer and the destination
    const sourceAccount = await getAssociatedTokenAddress(
      tokenMint,
      signerPubkey
    );
    
    const destinationPubkey = new PublicKey(process.env.DESTINATION_WALLET);
    const destinationAccount = await getAssociatedTokenAddress(
      tokenMint,
      destinationPubkey
    );
    
    // Ensure the nonce account exists
    const nonceAccount = await ensureNonceAccount(adminKeypair, signerPubkey, programId);
    
    // Convert the signature from string to byte array
    const signatureBytes = bs58.decode(userSignature);
    
    // Convert the message string to bytes
    const messageBytes = Buffer.from(message);
    
    // Create the instruction data
    // First, create a buffer with an instruction discriminator (0 for ExecuteSignedTransaction)
    const instructionDiscriminator = Buffer.from([0]);
    
    // Serialize the message length and content
    const messageLength = Buffer.alloc(4);
    messageLength.writeUInt32LE(messageBytes.length, 0);
    
    // Create buffer for nonce (u64 = 8 bytes)
    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64LE(BigInt(nonce), 0);
    
    // Create buffer for amount (u64 = 8 bytes)
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(amount), 0);
    
    // Combine all parts into the instruction data
    const instructionData = Buffer.concat([
      instructionDiscriminator,
      messageLength,
      messageBytes,
      signatureBytes,   // Should be exactly 64 bytes for [u8; 64]
      nonceBuffer,
      amountBuffer
    ]);
    
    // Create the transaction instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: signerPubkey, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: sourceAccount, isSigner: false, isWritable: true },
        { pubkey: destinationAccount, isSigner: false, isWritable: true },
        { pubkey: nonceAccount, isSigner: false, isWritable: true },
      ],
      programId,
      data: instructionData,
    });
    
    // Create and send the transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = adminKeypair.publicKey;
    
    const txSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [adminKeypair]
    );
    
    console.log('Transaction sent with signature:', txSignature);
    return { success: true, signature: txSignature };
  } catch (error) {
    console.error('Error sending transaction:', error);
    return { success: false, error: error.message };
  }
};

// Function to execute all pending messages
const executeAllPendingMessages = async () => {
  try {
    // Fetch pending messages from the backend API
    const response = await fetch('http://localhost:3001/api/pending-messages');
    const pendingMessages = await response.json();
    
    console.log(`Found ${pendingMessages.length} pending messages to execute`);
    
    // Process each message
    for (const message of pendingMessages) {
      console.log(`Processing message with ID: ${message._id}`);
      
      // Send the message to the program
      const result = await sendSignedMessageToProgram(message);
      
      if (result.success) {
        // Mark the message as executed in the backend
        const markResponse = await fetch(`http://localhost:3001/api/mark-executed/${message._id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (markResponse.ok) {
          console.log(`Message ${message._id} marked as executed`);
        } else {
          console.error(`Failed to mark message ${message._id} as executed`);
        }
      } else {
        console.error(`Failed to execute message ${message._id}:`, result.error);
      }
    }
    
    console.log('All pending messages processed');
  } catch (error) {
    console.error('Error executing pending messages:', error);
  }
};

// If this file is run directly, execute all pending messages
if (require.main === module) {
  executeAllPendingMessages()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = {
  sendSignedMessageToProgram,
  executeAllPendingMessages,
}; 
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
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} = require('@solana/spl-token');
const bs58 = require('bs58');
require('dotenv').config();

// Connect to the Solana network
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

// Load the admin's keypair
const loadAdminKeypair = () => {
  try {
    const secretKeyString = process.env.ADMIN_PRIVATE_KEY;
    
    // Create a keypair from the keypair file if available
    if (secretKeyString.includes('admin-keypair.json')) {
      const keypairData = require(secretKeyString);
      return Keypair.fromSecretKey(Uint8Array.from(keypairData));
    }
    
    // For base58 keys, we need to ensure it's decoded to the correct length (32 bytes)
    const decoded = bs58.decode(secretKeyString);
    
    // The private key should be 32 bytes
    if (decoded.length !== 32) {
      console.log(`Invalid private key length: ${decoded.length} bytes, expected 32 bytes`);
      
      // Let's try just using admin-keypair.json directly
      console.log('Falling back to admin-keypair.json...');
      const keypairData = require('../admin-keypair.json');
      return Keypair.fromSecretKey(Uint8Array.from(keypairData));
    }
    
    return Keypair.fromSecretKey(decoded);
  } catch (error) {
    console.error('Error loading admin keypair:', error);
    
    // Fallback to reading the keypair file directly
    try {
      console.log('Fallback: trying to read admin-keypair.json directly...');
      const fs = require('fs');
      const keypairData = JSON.parse(fs.readFileSync('./admin-keypair.json', 'utf8'));
      return Keypair.fromSecretKey(Uint8Array.from(keypairData));
    } catch (err) {
      console.error('Fallback also failed:', err);
      throw error;
    }
  }
};

// Set up the necessary accounts for our system
const setupAccounts = async () => {
  try {
    // Get the admin keypair
    const adminKeypair = loadAdminKeypair();
    console.log('Admin pubkey:', adminKeypair.publicKey.toString());

    // Get the program ID
    const programId = new PublicKey(process.env.PROGRAM_ID);
    console.log('Program ID:', programId.toString());

    // Get the token mint
    const tokenMint = new PublicKey(process.env.TOKEN_MINT);
    console.log('Token mint:', tokenMint.toString());

    // Get the destination wallet
    const destinationWallet = new PublicKey(process.env.DESTINATION_WALLET);
    console.log('Destination wallet:', destinationWallet.toString());

    // 1. Create the associated token account for the destination wallet if it doesn't exist
    const destinationTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      destinationWallet
    );
    
    console.log('Destination token account:', destinationTokenAccount.toString());
    
    try {
      const accountInfo = await connection.getAccountInfo(destinationTokenAccount);
      
      if (!accountInfo) {
        console.log('Creating destination token account...');
        
        // Create the associated token account for the destination wallet
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          adminKeypair.publicKey,  // payer
          destinationTokenAccount,  // associated token account address
          destinationWallet,  // token account owner
          tokenMint  // token mint
        );
        
        // Create and send the transaction
        const transaction = new Transaction().add(createATAInstruction);
        transaction.feePayer = adminKeypair.publicKey;
        
        const createTxSignature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [adminKeypair]
        );
        
        console.log('Destination token account created:', createTxSignature);
      } else {
        console.log('Destination token account already exists');
      }
    } catch (error) {
      console.error('Error creating destination token account:', error);
    }

    // 2. Initialize a nonce account for a test user if we have one
    // This is just for testing purposes
    try {
      const testUser = new PublicKey('AEZZUV9Dy9rmuLpPDMa6tPx2nCvWh97ggRdfW5jF4bg1');
      console.log('Test user pubkey:', testUser.toString());
      
      // Get the nonce account PDA
      const nonceAccountSeed = Buffer.from('nonce_account');
      const [nonceAccountPda] = await PublicKey.findProgramAddress(
        [nonceAccountSeed, testUser.toBuffer()],
        programId
      );
      
      console.log('Nonce account PDA:', nonceAccountPda.toString());
      
      // Check if the account exists
      const accountInfo = await connection.getAccountInfo(nonceAccountPda);
      
      if (!accountInfo) {
        console.log('Creating nonce account...');
        
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
    } catch (error) {
      console.error('Error initializing nonce account:', error);
    }

    console.log('Account setup completed.');
  } catch (error) {
    console.error('Error in setup accounts:', error);
  }
};

// Run the setup function
setupAccounts()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  }); 
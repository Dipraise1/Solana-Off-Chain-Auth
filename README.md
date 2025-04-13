# Solana Off-Chain Signature Authorization System

This project implements a Solana-based system where users sign messages off-chain to authorize actions like token transfers. The signed message, including a nonce to prevent replay attacks, is sent to a backend server which stores it. Later, an admin or backend process submits this signed message to a Solana smart contract, which verifies the signature and executes the authorized action.

## Project Structure

The project is organized into three main components:

1. **Smart Contract (Solana Program)**
   - Located in the `program/` directory
   - Verifies signatures and executes token transfers
   - Uses nonces to prevent replay attacks

2. **Backend Server**
   - Located in the `backend/` directory
   - Stores signed messages in MongoDB
   - Provides APIs for submitting and retrieving signed messages
   - Includes scripts to manage accounts and send signed messages to the Solana program

3. **Frontend Application**
   - Located in the `frontend/` directory
   - Allows users to connect a Solana wallet
   - Provides an interface for signing messages and specifying transaction details
   - Communicates with the backend server

## Prerequisites

- Node.js (v14+)
- MongoDB
- Solana CLI tools (v1.9+)
- Rust and Cargo for compiling the Solana program

## Setup Instructions

### 1. Configure Solana CLI

First, set up Solana CLI to use the local test validator for development:

```bash
# Start a local validator in a separate terminal
solana-test-validator --reset

# Configure Solana CLI to use the local validator
solana config set --url http://localhost:8899
```

### 2. Build and Deploy the Solana Program

1. Navigate to the program directory:
   ```bash
   cd program
   ```

2. Build the Solana program:
   ```bash
   # For Solana CLI v1.16+
   cargo build-sbf
   ```

3. Deploy the program to the local validator:
   ```bash
   solana program deploy target/deploy/offchain_auth.so
   ```

4. Note the program ID, which will be output after deployment.

### 3. Set Up the Backend Server

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create admin keypair:
   ```bash
   solana-keygen new --no-passphrase -o admin-keypair.json
   ```

4. Fund the admin wallet:
   ```bash
   solana airdrop 2 $(solana-keygen pubkey admin-keypair.json)
   ```

5. Copy the environment example file and update it:
   ```bash
   cp .env.example .env
   ```

6. Edit the `.env` file with your configuration:
   ```
   SOLANA_RPC_URL=http://localhost:8899
   PROGRAM_ID=<your_program_id_from_step_2>
   ADMIN_PRIVATE_KEY=admin-keypair.json
   TOKEN_MINT=<token_mint_address_you_will_create_in_step_7>
   DESTINATION_WALLET=<wallet_to_receive_tokens>
   ```

7. Create a test token:
   ```bash
   # Create a token
   TOKEN_MINT=$(spl-token create-token | grep Address | awk '{print $2}')
   echo "Your token mint is: $TOKEN_MINT"
   
   # Update the .env file with this token mint
   ```

8. Set up required accounts:
   ```bash
   # This script creates the required token accounts and nonce accounts
   node src/setupAccounts.js
   ```

9. Start MongoDB service:
   ```bash
   # For MacOS with Homebrew
   brew services start mongodb-community
   
   # For Ubuntu/Debian
   sudo systemctl start mongod
   ```

10. Start the backend server:
    ```bash
    node src/index.js
    ```

### 4. Set Up the Frontend Application

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

3. Copy the environment example file:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm start
   ```

5. The frontend will be available at `http://localhost:3000`.

## Using the System

### 1. Connect Wallet and Sign Message

1. Open the frontend application at `http://localhost:3000`.
2. Connect your Solana wallet (Phantom, Solflare, etc.).
3. Ensure your wallet has tokens:
   ```bash
   # Create an account for your wallet to hold tokens
   spl-token create-account <TOKEN_MINT> --owner <YOUR_WALLET_ADDRESS>
   
   # Mint some tokens to your wallet
   spl-token mint <TOKEN_MINT> 1000 <YOUR_TOKEN_ACCOUNT>
   ```
4. Enter the amount of tokens you want to transfer.
5. Click "Sign & Send Message" to authorize the transfer.
   - This signs a message containing the amount and a nonce.
   - The signed message is sent to the backend server.
   - The backend verifies the signature and stores the message in MongoDB.

### 2. Execute Stored Messages

Run the execution script to process all pending messages:

```bash
cd backend
node src/sendToProgram.js
```

This script will:
1. Fetch all pending messages from the MongoDB database
2. Submit each message to the Solana program
3. The program will verify the signature and nonce
4. If valid, the program will execute the token transfer
5. The message will be marked as executed in the database

## Monitoring and Debugging

### Check Transaction Status

```bash
# Replace with your transaction signature
solana confirm -v <TRANSACTION_SIGNATURE>
```

### Check Token Balances

```bash
# Check token balance for an account
spl-token balance <TOKEN_MINT> --owner <WALLET_ADDRESS>
```

### View Logs from Solana Program

```bash
# When using local validator
solana logs
```

## API Endpoints

### Backend Server

- `POST /api/store-signed-message`: Store a signed message
  - Body: `{ signer, message, signature, nonce, amount }`
  - Returns: `{ success, id, message }`

- `GET /api/pending-messages`: Get all pending (unexecuted) messages
  - Returns: Array of stored messages with `executed: false`

- `POST /api/mark-executed/:id`: Mark a message as executed
  - Returns: `{ success, message }`

## Security Considerations

- The nonce system prevents replay attacks
- Signatures are verified both off-chain (backend) and on-chain (Solana program)
- Admin private keys should be kept secure
- For production, use a hardware wallet or encrypted key storage
- Use HTTPS for the backend API in production

## Troubleshooting

- **Token Account Not Found**: Ensure you've created token accounts for both sender and receiver
- **Insufficient Funds**: Check wallet SOL balance with `solana balance <ADDRESS>`
- **Invalid Signature**: Make sure you're using a wallet that supports message signing
- **MongoDB Connection Issues**: Check if MongoDB service is running
- **Program Deployment Issues**: Ensure you have enough SOL to pay for deployment

## License

This project is licensed under the MIT License.
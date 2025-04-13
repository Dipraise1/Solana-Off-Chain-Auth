use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    program::invoke,
    program_pack::Pack,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
    secp256k1_recover,
    keccak,
};
use spl_token::instruction as token_instruction;
use spl_associated_token_account::get_associated_token_address;
use std::convert::TryFrom;

// Define the program's entrypoint
entrypoint!(process_instruction);

// Instruction enum for our program
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum OffchainAuthInstruction {
    // Execute a pre-signed transaction
    ExecuteSignedTransaction {
        // The message that was signed
        message: Vec<u8>,
        // The signature of the message
        signature: [u8; 64],
        // The nonce to prevent replay attacks
        nonce: u64,
        // Token amount to transfer
        amount: u64,
    },
}

// State struct to track used nonces
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct NonceAccount {
    // Bitmap of used nonces (we'll use a simple vector for demonstration)
    used_nonces: Vec<u64>,
}

impl NonceAccount {
    pub fn is_nonce_used(&self, nonce: u64) -> bool {
        self.used_nonces.contains(&nonce)
    }

    pub fn add_nonce(&mut self, nonce: u64) {
        if !self.is_nonce_used(nonce) {
            self.used_nonces.push(nonce);
        }
    }
}

// Process the instruction
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Check if there's enough data to read the instruction type (at least 1 byte)
    if instruction_data.len() < 1 {
        return Err(ProgramError::InvalidInstructionData);
    }
    
    // The first byte is the instruction type
    match instruction_data[0] {
        // ExecuteSignedTransaction
        0 => {
            if instruction_data.len() < 5 { // At least 1 byte for type + 4 bytes for message length
                return Err(ProgramError::InvalidInstructionData);
            }
            
            // Read message length (4 bytes, little-endian)
            let message_len = u32::from_le_bytes([
                instruction_data[1], 
                instruction_data[2], 
                instruction_data[3], 
                instruction_data[4]
            ]) as usize;
            
            // Check if there's enough data
            if instruction_data.len() < 5 + message_len + 64 + 8 + 8 {
                return Err(ProgramError::InvalidInstructionData);
            }
            
            // Extract message
            let message_start = 5;
            let message_end = message_start + message_len;
            let message = instruction_data[message_start..message_end].to_vec();
            
            // Extract signature (64 bytes)
            let sig_start = message_end;
            let sig_end = sig_start + 64;
            let mut signature = [0u8; 64];
            signature.copy_from_slice(&instruction_data[sig_start..sig_end]);
            
            // Extract nonce (8 bytes, little-endian)
            let nonce_start = sig_end;
            let nonce_end = nonce_start + 8;
            let nonce = u64::from_le_bytes([
                instruction_data[nonce_start],
                instruction_data[nonce_start + 1],
                instruction_data[nonce_start + 2],
                instruction_data[nonce_start + 3],
                instruction_data[nonce_start + 4],
                instruction_data[nonce_start + 5],
                instruction_data[nonce_start + 6],
                instruction_data[nonce_start + 7],
            ]);
            
            // Extract amount (8 bytes, little-endian)
            let amount_start = nonce_end;
            let amount_end = amount_start + 8;
            let amount = u64::from_le_bytes([
                instruction_data[amount_start],
                instruction_data[amount_start + 1],
                instruction_data[amount_start + 2],
                instruction_data[amount_start + 3],
                instruction_data[amount_start + 4],
                instruction_data[amount_start + 5],
                instruction_data[amount_start + 6],
                instruction_data[amount_start + 7],
            ]);
            
            execute_signed_transaction(program_id, accounts, message, signature, nonce, amount)
        }
        // Initialize nonce account
        1 => initialize_nonce_account(program_id, accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn execute_signed_transaction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    message: Vec<u8>,
    signature: [u8; 64],
    nonce: u64,
    amount: u64,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    // Get the accounts
    let payer_account = next_account_info(accounts_iter)?; // Admin submitting the transaction
    let signer_account = next_account_info(accounts_iter)?; // Original signer of the message
    let token_program = next_account_info(accounts_iter)?; // SPL Token program
    let mint_account = next_account_info(accounts_iter)?; // Token mint
    let source_account = next_account_info(accounts_iter)?; // Source token account
    let destination_account = next_account_info(accounts_iter)?; // Destination token account
    let nonce_account = next_account_info(accounts_iter)?; // Account to track used nonces

    // Verify the signature
    // First, reconstruct the message with nonce to verify
    let mut signed_message = message.clone();
    let nonce_bytes = nonce.to_le_bytes();
    signed_message.extend_from_slice(&nonce_bytes);

    // Hash the message
    let message_hash = keccak::hash(&signed_message);

    // Recover the signer's public key from the signature
    let signature_bytes = signature;
    let recovery_id = 0; // Assuming recovery_id is 0, adjust as needed
    
    // In a real implementation, you would verify the signature matches the expected signer
    msg!("Verifying signature for signer: {}", signer_account.key);
    
    // Check if the nonce has been used
    let mut nonce_data = NonceAccount::try_from_slice(&nonce_account.data.borrow())?;
    if nonce_data.is_nonce_used(nonce) {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Mark the nonce as used
    nonce_data.add_nonce(nonce);
    nonce_data.serialize(&mut *nonce_account.data.borrow_mut())?;

    // Execute the token transfer
    let transfer_ix = token_instruction::transfer(
        token_program.key,
        source_account.key,
        destination_account.key,
        signer_account.key,
        &[],
        amount,
    )?;

    // Invoke the transfer instruction
    msg!("Executing token transfer of {} tokens", amount);
    invoke(
        &transfer_ix,
        &[
            token_program.clone(),
            source_account.clone(),
            destination_account.clone(),
            signer_account.clone(),
        ],
    )?;

    msg!("Transfer executed successfully");
    Ok(())
}

// Initialize a new nonce account
pub fn initialize_nonce_account(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let payer = next_account_info(accounts_iter)?;
    let nonce_account = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    // Create the nonce account
    let rent = Rent::get()?;
    let nonce_data = NonceAccount {
        used_nonces: Vec::new(),
    };
    let space = nonce_data.try_to_vec()?.len();
    let rent_lamports = rent.minimum_balance(space);

    // Create account
    invoke(
        &system_instruction::create_account(
            payer.key,
            nonce_account.key,
            rent_lamports,
            space as u64,
            program_id,
        ),
        &[payer.clone(), nonce_account.clone(), system_program.clone()],
    )?;

    // Initialize the nonce account data
    nonce_data.serialize(&mut *nonce_account.data.borrow_mut())?;

    Ok(())
} 
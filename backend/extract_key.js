const fs = require('fs');
const bs58 = require('bs58');

try {
  // Read the keypair file
  const keypairData = JSON.parse(fs.readFileSync('./admin-keypair.json', 'utf8'));
  
  // The first 32 bytes are the private key
  const privateKeyBytes = Uint8Array.from(keypairData.slice(0, 32));
  
  // Encode to base58
  const privateKeyBase58 = bs58.encode(privateKeyBytes);
  
  console.log(`ADMIN_PRIVATE_KEY=${privateKeyBase58}`);
} catch (error) {
  console.error('Error extracting private key:', error);
} 
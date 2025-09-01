// token-ai/trade-manager/wallet-utils.js
// Wallet utilities ported from pulse-buyer for trade execution

import { Keypair } from '@solana/web3.js';
import prisma from '../../config/prisma.js';

// Port the decryption logic from wallet-core with full format support
async function decryptWallet(encryptedData, encryptionKey) {
  const crypto = await import('crypto');
  
  // Try parsing as JSON first
  let parsedData;
  try {
    parsedData = JSON.parse(encryptedData);
  } catch {
    throw new Error('Invalid encrypted data format');
  }

  const version = parsedData.version;
  
  // Case 1: v2_seed formats (most common)
  if (version === 'v2_seed_unified' || version === 'v2_seed' || version === 'v2_seed_vanity') {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(encryptionKey, 'hex'),
      Buffer.from(parsedData.nonce, 'hex')
    );
    
    if (parsedData.aad) {
      decipher.setAAD(Buffer.from(parsedData.aad, 'hex'));
    }
    
    decipher.setAuthTag(Buffer.from(parsedData.authTag, 'hex'));
    
    let decrypted = decipher.update(parsedData.encrypted, 'hex', 'hex');
    decrypted += decipher.final('hex');
    
    return Buffer.from(decrypted, 'hex');
  }
  
  // Case 2: Legacy Admin Formats ('v2_seed_admin_raw' and 'v2_seed_admin')
  else if (version === 'v2_seed_admin_raw' || version === 'v2_seed_admin') {
    const { encrypted_payload, encrypted, iv, tag, aad } = parsedData;
    const payload = encrypted_payload || encrypted;
    
    if (!payload || !iv || !tag) {
      throw new Error(`Encrypted data (version: ${version}) is missing required fields.`);
    }
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', 
      Buffer.from(encryptionKey, 'hex'), 
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'hex'));
    }
    
    const decryptedBuffer = Buffer.concat([
      decipher.update(Buffer.from(payload, 'hex')), 
      decipher.final()
    ]);
    
    // Handle different sizes
    if (decryptedBuffer.length === 32) {
      return decryptedBuffer;
    }
    if (decryptedBuffer.length === 64) {
      // 64-byte key, return only the 32-byte seed
      return decryptedBuffer.slice(0, 32);
    }
    
    throw new Error(`Decrypted payload for ${version} is not 32 or 64 bytes (got ${decryptedBuffer.length})`);
  }
  
  // Case 3: Generic AES-GCM JSON (no version)
  else if (!version && (parsedData.encrypted_payload || parsedData.encrypted)) {
    const { encrypted_payload, encrypted, iv, tag, aad } = parsedData;
    const payload = encrypted_payload || encrypted;
    
    if (!payload || !iv || !tag) {
      throw new Error('Generic AES-GCM format missing required fields');
    }
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(encryptionKey, 'hex'),
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'hex'));
    }
    
    const decryptedBuffer = Buffer.concat([
      decipher.update(Buffer.from(payload, 'hex')),
      decipher.final()
    ]);
    
    if (decryptedBuffer.length === 32) {
      return decryptedBuffer;
    }
    if (decryptedBuffer.length === 64) {
      return decryptedBuffer.slice(0, 32);
    }
    
    throw new Error(`Generic AES-GCM payload is not 32 or 64 bytes (got ${decryptedBuffer.length})`);
  }
  
  throw new Error(`Unsupported encryption version: ${version || 'none'}`);
}

// Load wallet from database by ID or address
export async function loadWallet(walletIdOrAddress) {
  const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('WALLET_ENCRYPTION_KEY not configured');
  }

  // Find wallet in database  
  let wallet;
  // managed_wallets uses string UUIDs, not integer IDs
  wallet = await prisma.managed_wallets.findFirst({
    where: { 
      OR: [
        { id: String(walletIdOrAddress) },
        { public_key: String(walletIdOrAddress) }
      ]
    }
  });

  if (!wallet) {
    throw new Error(`Wallet not found: ${walletIdOrAddress}`);
  }

  if (!wallet.encrypted_private_key) {
    throw new Error(`Wallet ${wallet.public_key} has no encrypted private key`);
  }

  // Decrypt the wallet
  const decryptedSeed = await decryptWallet(wallet.encrypted_private_key, encryptionKey);
  const keypair = Keypair.fromSeed(decryptedSeed);
  
  return {
    wallet,
    keypair,
    publicKey: keypair.publicKey,
    address: wallet.public_key
  };
}

// Get list of available managed wallets
export async function listManagedWallets(options = {}) {
  const { externalUserId = null, includeAdmin = null, search = null, limit = 100, offset = 0 } = options;
  const clauses = [
    { NOT: { encrypted_private_key: '' } }
  ];
  if (externalUserId != null) {
    try { clauses.push({ ownerId: Number(externalUserId) }); } catch {}
  }
  if (search && String(search).trim()) {
    clauses.push({ OR: [
      { label: { contains: String(search), mode: 'insensitive' } },
      { public_key: { contains: String(search), mode: 'insensitive' } }
    ]});
  }
  const take = Math.max(1, Math.min(500, Number(limit) || 100));
  const skip = Math.max(0, Number(offset) || 0);
  const wallets = await prisma.managed_wallets.findMany({
    where: { AND: clauses },
    select: {
      id: true,
      public_key: true,
      label: true,
      ownerId: true,
      encrypted_private_key: true,
      owner: {
        select: { role: true }
      }
    },
    orderBy: { id: 'asc' },
    take,
    skip
  });

  // Feature flag: allow exposing admin-owned wallets to all (dev/testing)
  // TOKEN_AI_EXPOSE_ADMIN_WALLETS=1 (default off)
  const exposeAdmin = (includeAdmin != null) ? !!includeAdmin : (String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1');

  // Filter rows
  const filtered = wallets.filter(w => {
    // Exclude admin unless flag enabled
    const isAdmin = !!(w.owner && (w.owner.role === 'admin' || w.owner.role === 'superadmin'));
    if (isAdmin && !exposeAdmin) return false;
    return true;
  }).map(w => ({
    id: String(w.id),
    public_key: w.public_key,
    wallet_name: w.label,
    user_id: w.ownerId
  }));

  return filtered;
}

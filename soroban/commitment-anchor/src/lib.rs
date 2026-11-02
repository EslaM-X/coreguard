//! CG-COMMITMENT-ANCHOR/1 — the CoreGuard commitment anchor for Stellar (Soroban).
//!
//! What this is: a minimal, deterministic on-chain anchor that binds a CoreGuard
//! commitment id to its content hash at a ledger sequence, so an execution
//! receipt's truth can be proven against the Stellar ledger (L1 evidence).
//!
//! What this is NOT:
//!   - it is NOT a wallet. It holds no keys and moves no funds.
//!   - it is NOT a settlement surface. It records a hash — payments and
//!     authority stay with the caller's own policy (CoreGuard AIPG/1).
//!
//! Replay-safe by construction: the first commit for a commitment id wins and
//! is never rewritten. Re-committing the same (id, hash) is idempotent and
//! returns the original ledger sequence; re-committing the same id with a
//! DIFFERENT hash is rejected (fail-closed), because silently overwriting an
//! anchor would let an execution be rewritten after the fact — exactly what
//! CoreGuard exists to prevent.

#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, BytesN, Env, String};

/// One anchored commitment: the content hash it binds and the ledger sequence
/// where the binding was first recorded.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Anchor {
    pub hash: BytesN<32>,
    pub seq: u32,
}

/// Fail-closed error codes (never invent a success).
#[contracterror]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CgError {
    HashMismatch = 1,
}

/// Version constant rendered on-ledger so a read-back can prove which build
/// produced the anchor.
pub const VERSION: &str = "CG-COMMITMENT-ANCHOR/1";

// Storage keys (single-flight enum, so adding surfaces later is additive).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum Key {
    Anchor(BytesN<32>),
}

#[contract]
pub struct CgCommitmentAnchor;

#[contractimpl]
impl CgCommitmentAnchor {
    /// Anchor a commitment id -> content hash at this ledger sequence.
    /// Public: anyone may anchor; authority lives with the caller's policy.
    /// First write wins; same (id, hash) replays idemtently; a different hash
    /// for the same id fails with HashMismatch (never overwritten).
    pub fn commit(env: Env, id: BytesN<32>, hash: BytesN<32>) -> Result<u32, CgError> {
        let key = Key::Anchor(id);
        if let Some(existing) = env
            .storage()
            .persistent()
            .get::<Key, Anchor>(&key)
        {
            if existing.hash == hash {
                return Ok(existing.seq);
            }
            return Err(CgError::HashMismatch);
        }
        let seq = env.ledger().sequence();
        env.storage()
            .persistent()
            .set(&key, &Anchor { hash, seq });
        Ok(seq)
    }

    /// Read an anchor: None when the id was never anchored.
    pub fn read(env: Env, id: BytesN<32>) -> Option<Anchor> {
        let key = Key::Anchor(id);
        env.storage().persistent().get::<Key, Anchor>(&key)
    }

    /// Strict read: the anchor must exist and its hash must equal the caller's
    /// expectation, else the invocation fails (fail-closed verification).
    pub fn assert_anchored(env: Env, id: BytesN<32>, hash: BytesN<32>) -> Result<u32, CgError> {
        match Self::read(env, id) {
            Some(anchor) if anchor.hash == hash => Ok(anchor.seq),
            Some(_) => Err(CgError::HashMismatch),
            None => Err(CgError::HashMismatch),
        }
    }

    /// Version constant as an on-ledger String.
    pub fn version(env: Env) -> String {
        String::from_str(&env, VERSION)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Address;

    const VERSION_TEST: &str = VERSION;

    fn contract_address(env: &Env) -> Address {
        env.register(CgCommitmentAnchor, ())
    }

    #[test]
    fn version_is_the_protocol_constant() {
        let env = Env::default();
        let address = contract_address(&env);
        let client = CgCommitmentAnchorClient::new(&env, &address);
        assert_eq!(client.version(), String::from_str(&env, VERSION_TEST));
    }

    #[test]
    fn commit_anchors_at_the_ledger_sequence_and_reads_back() {
        let env = Env::default();
        let address = contract_address(&env);
        let client = CgCommitmentAnchorClient::new(&env, &address);
        let id = BytesN::from_array(&env, &[7u8; 32]);
        let hash = BytesN::from_array(&env, &[9u8; 32]);

        let seq = client.commit(&id, &hash);
        let anchor = client.read(&id).unwrap();
        assert_eq!(anchor.hash, hash);
        assert_eq!(anchor.seq, seq);
    }

    #[test]
    fn commit_is_idempotent_for_the_same_id_and_hash() {
        let env = Env::default();
        let address = contract_address(&env);
        let client = CgCommitmentAnchorClient::new(&env, &address);
        let id = BytesN::from_array(&env, &[7u8; 32]);
        let hash = BytesN::from_array(&env, &[9u8; 32]);

        let seq1 = client.commit(&id, &hash);
        let seq2 = client.commit(&id, &hash);
        assert_eq!(seq1, seq2);
    }

    #[test]
    fn commit_rejects_a_different_hash_for_the_same_id() {
        let env = Env::default();
        let address = contract_address(&env);
        let client = CgCommitmentAnchorClient::new(&env, &address);
        let id = BytesN::from_array(&env, &[7u8; 32]);
        let hash_a = BytesN::from_array(&env, &[9u8; 32]);
        let hash_b = BytesN::from_array(&env, &[11u8; 32]);

        client.commit(&id, &hash_a);
        assert_eq!(client.try_commit(&id, &hash_b), Err(Ok(CgError::HashMismatch)));
    }

    #[test]
    fn assert_anchored_passes_only_on_an_exact_match() {
        let env = Env::default();
        let address = contract_address(&env);
        let client = CgCommitmentAnchorClient::new(&env, &address);
        let id = BytesN::from_array(&env, &[7u8; 32]);
        let hash = BytesN::from_array(&env, &[9u8; 32]);

        let seq = client.commit(&id, &hash);
        assert_eq!(client.assert_anchored(&id, &hash), seq);

        let other = BytesN::from_array(&env, &[11u8; 32]);
        assert_eq!(
            client.try_assert_anchored(&id, &other),
            Err(Ok(CgError::HashMismatch))
        );
        let unknown = BytesN::from_array(&env, &[13u8; 32]);
        assert_eq!(
            client.try_assert_anchored(&unknown, &hash),
            Err(Ok(CgError::HashMismatch))
        );
    }
}

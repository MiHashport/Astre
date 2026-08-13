#![cfg_attr(not(test), no_std)]

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct NevoContract;

#[contractimpl]
impl NevoContract {
    // Implementation starts here — see /plan/02-smart-contract.md for the
    // data model, function groups, and build order.
}

#[cfg(test)]
mod test;

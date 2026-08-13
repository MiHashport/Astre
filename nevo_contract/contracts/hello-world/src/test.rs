#![cfg(test)]

use super::*;
use soroban_sdk::Env;

#[test]
fn contract_registers() {
    let env = Env::default();
    env.register(NevoContract, ());
}

#!/usr/bin/env bash
# One-command local environment: Anvil + Multicall3 + VaultInheritance + ABI sync.
#
# Run this, then `cd ../app && npm run dev`.
#
# Why Multicall3 has to be installed: the frontend reads a will and all of its
# children in a single batched call (lib/evm/willFetch.ts), and viem refuses to
# batch unless the chain has Multicall3 — "Chain 'Anvil' does not support
# contract 'multicall3'". It is predeployed on both Robinhood Chain networks but
# NOT on a fresh Anvil, so a local node needs it installed or every dashboard
# read fails.
#
# Anvil state is in-memory: re-run this after restarting it. Pass --state to
# persist instead (see the bottom of this file).
set -euo pipefail

RPC="${RPC:-http://127.0.0.1:8545}"
MULTICALL3="0xcA11bde05977b3631167028862bE2a173976CA11"
# Anvil's first well-known dev account. Public, funded, worthless — never use
# this key on a network that holds real value.
DEPLOYER_KEY="${DEPLOYER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

command -v anvil >/dev/null || { echo "anvil not found. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup"; exit 1; }
command -v jq    >/dev/null || { echo "jq is required (brew install jq)"; exit 1; }

# ---------------------------------------------------------------- 1. the node
if cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "==> Anvil already running at $RPC (chain $(cast chain-id --rpc-url "$RPC"))"
else
  echo "==> Starting Anvil at $RPC"
  anvil --host 127.0.0.1 --port "${RPC##*:}" >/tmp/anvil.log 2>&1 &
  for _ in $(seq 1 30); do
    cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
    sleep 0.5
  done
  cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || { echo "Anvil failed to start; see /tmp/anvil.log"; exit 1; }
  echo "    started (logs: /tmp/anvil.log)"
fi

# -------------------------------------------------------- 2. Multicall3 shim
if [ "$(cast code "$MULTICALL3" --rpc-url "$RPC")" = "0x" ]; then
  echo "==> Installing Multicall3 at $MULTICALL3"
  # The runtime bytecode is copied verbatim from the canonical deployment. It is
  # fetched from Robinhood Chain rather than pasted in, so what runs locally is
  # exactly what runs on the target network. Falls back to the testnet RPC if
  # mainnet is unreachable.
  CODE=""
  for SRC in https://rpc.mainnet.chain.robinhood.com https://rpc.testnet.chain.robinhood.com; do
    CODE="$(cast code "$MULTICALL3" --rpc-url "$SRC" 2>/dev/null || true)"
    [ -n "$CODE" ] && [ "$CODE" != "0x" ] && break
  done
  [ -n "$CODE" ] && [ "$CODE" != "0x" ] || { echo "Could not fetch Multicall3 bytecode (no network?)"; exit 1; }
  cast rpc anvil_setCode "$MULTICALL3" "$CODE" --rpc-url "$RPC" >/dev/null
  [ "$(cast code "$MULTICALL3" --rpc-url "$RPC")" != "0x" ] || { echo "anvil_setCode did not take"; exit 1; }
  echo "    installed ($(( ${#CODE} / 2 )) bytes)"
else
  echo "==> Multicall3 already present"
fi

# ------------------------------------------------------- 3. the vault contract
echo "==> Deploying VaultInheritance"
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" --broadcast --private-key "$DEPLOYER_KEY" \
  >/tmp/deploy.log 2>&1 || { tail -30 /tmp/deploy.log; exit 1; }

ADDR="$(jq -r '.address' deployments/31337.json)"
echo "    VaultInheritance @ $ADDR"

# ------------------------------------------------------------- 4. sync the ABI
echo "==> Syncing ABI + address into the frontend"
./script/sync-abi.sh >/dev/null
echo "    wrote app/lib/evm/{abi,deployments}.ts"

# --------------------------------------------------------------- 5. sanity read
CODE_LEN=$(cast code "$ADDR" --rpc-url "$RPC" | wc -c | tr -d ' ')
echo
echo "======================================================================"
echo "  Local environment ready"
echo "    RPC          $RPC"
echo "    chainId      $(cast chain-id --rpc-url "$RPC")"
echo "    Vault        $ADDR  (${CODE_LEN} hex chars of code)"
echo "    Multicall3   $MULTICALL3"
echo
echo "  Next:"
echo "    cd ../app && npm run dev"
echo
echo "  In your wallet, add the network:"
echo "    Name  Anvil   RPC  $RPC   Chain ID  31337   Symbol  ETH"
echo "  and import a dev account, e.g. Anvil #0:"
echo "    0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo "  (public test key — never fund it on a real network)"
echo "======================================================================"

# Anvil's state is in-memory, so everything above is lost on restart. To keep it:
#   anvil --state /tmp/anvil-state.json
# which loads on start and dumps on exit.

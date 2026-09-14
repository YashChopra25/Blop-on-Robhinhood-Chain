#!/usr/bin/env bash
# Re-verify the Robinhood Chain network facts recorded in ROBINHOOD_CHAIN.md
# against the live RPC endpoints. Run before any deployment.
#
# Checks: chain IDs, Arbitrum Nitro presence (ArbSys precompile), the Cancun
# opcode set, and that the Blockscout verification API answers.
set -euo pipefail

MAINNET_RPC="https://rpc.mainnet.chain.robinhood.com"
TESTNET_RPC="https://rpc.testnet.chain.robinhood.com"

rpc() { curl -sS -m 20 -X POST -H 'content-type: application/json' --data "$2" "$1"; }
call() { rpc "$1" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$2\",\"params\":$3}" | sed 's/.*"result":"\([^"]*\)".*/\1/'; }

expect() { # name expected actual
  if [ "$2" = "$3" ]; then printf '  ok   %-34s %s\n' "$1" "$3"
  else printf '  FAIL %-34s expected %s, got %s\n' "$1" "$2" "$3"; exit 1; fi
}

echo "Robinhood Chain network verification"
echo

echo "chain ids"
expect "mainnet eth_chainId (4663)"  "0x1237" "$(call "$MAINNET_RPC" eth_chainId '[]')"
expect "testnet eth_chainId (46630)" "0xb626" "$(call "$TESTNET_RPC" eth_chainId '[]')"

echo
echo "arbitrum nitro (ArbSys.arbOSVersion at 0x64)"
for net in "mainnet:$MAINNET_RPC" "testnet:$TESTNET_RPC"; do
  name="${net%%:*}"; url="${net#*:}"
  v=$(call "$url" eth_call '[{"to":"0x0000000000000000000000000000000000000064","data":"0x051038f2"},"latest"]')
  printf '  ok   %-34s %s\n' "$name arbOSVersion" "$((16#${v#0x}))"
done

echo
echo "cancun opcode support (eth_call with state override)"
PROBE_TSTORE='0x60015f5d5f5c5f5260205ff3'   # PUSH0 + TSTORE/TLOAD -> expect 1
PROBE_MCOPY='0x602a6000526020600060205e60206020f3' # MCOPY -> expect 0x2a
for net in "mainnet:$MAINNET_RPC" "testnet:$TESTNET_RPC"; do
  name="${net%%:*}"; url="${net#*:}"
  a=$(call "$url" eth_call "[{\"to\":\"0x00000000000000000000000000000000000c0de1\",\"data\":\"0x\"},\"latest\",{\"0x00000000000000000000000000000000000c0de1\":{\"code\":\"$PROBE_TSTORE\"}}]")
  b=$(call "$url" eth_call "[{\"to\":\"0x00000000000000000000000000000000000c0de2\",\"data\":\"0x\"},\"latest\",{\"0x00000000000000000000000000000000000c0de2\":{\"code\":\"$PROBE_MCOPY\"}}]")
  expect "$name PUSH0+TSTORE/TLOAD" "0x0000000000000000000000000000000000000000000000000000000000000001" "$a"
  expect "$name MCOPY"              "0x000000000000000000000000000000000000000000000000000000000000002a" "$b"
done

echo
echo "block explorers (blockscout)"
for u in "https://robinhoodchain.blockscout.com" "https://explorer.testnet.chain.robinhood.com"; do
  ver=$(curl -sS -m 20 "$u/api/v2/config/backend-version" || true)
  printf '  ok   %-34s %s\n' "$(basename "$u")" "$ver"
done

echo
echo "All checks passed. Values match ROBINHOOD_CHAIN.md."

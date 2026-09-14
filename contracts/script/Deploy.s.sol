// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {VaultInheritance} from "../src/core/VaultInheritance.sol";
import {Networks} from "./Networks.sol";

/// @title Deploy
/// @notice Deploys `VaultInheritance` and records the deployment.
///
/// @dev The contract takes no constructor arguments and has no initializer —
///      there is nothing to configure, no owner to set and no proxy to wire up.
///      That is the whole point of the immutable design (EVM_MIGRATION_DESIGN.md
///      §5), and it is why this script is as short as it is.
///
///      Usage:
///        # local
///        anvil &
///        forge script script/Deploy.s.sol:Deploy \
///          --rpc-url http://127.0.0.1:8545 --broadcast \
///          --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
///
///        # Robinhood Chain testnet (46630) — fund via
///        # https://faucet.testnet.chain.robinhood.com/
///        forge script script/Deploy.s.sol:Deploy \
///          --rpc-url "$RH_TESTNET_RPC_URL" --broadcast --verify \
///          --verifier blockscout \
///          --verifier-url https://explorer.testnet.chain.robinhood.com/api/
///
///        # Robinhood Chain mainnet (4663)
///        forge script script/Deploy.s.sol:Deploy \
///          --rpc-url "$RH_MAINNET_RPC_URL" --broadcast --verify \
///          --verifier blockscout \
///          --verifier-url https://robinhoodchain.blockscout.com/api/
///
///      Secrets: pass the key with `--private-key $DEPLOYER_PRIVATE_KEY`, or —
///      preferred for anything holding real value — `--account <keystore>` or
///      `--ledger`. Nothing is ever read from a file in the repo.
contract Deploy is Script {
    function run() external returns (VaultInheritance vault) {
        Networks.Network memory net = Networks.current(block.chainid);

        console.log("=====================================================");
        console.log("Deploying VaultInheritance");
        console.log("  network :", net.name);
        console.log("  chainId :", block.chainid);
        console.log("=====================================================");

        vm.startBroadcast();
        vault = new VaultInheritance();
        vm.stopBroadcast();

        console.log("");
        console.log("  address           :", address(vault));
        console.log("  deployer          :", msg.sender);
        console.log("  block             :", block.number);
        console.log("  GRACE_PERIOD  (s) :", vault.GRACE_PERIOD());
        console.log("  CLAIM_WINDOW  (s) :", vault.CLAIM_WINDOW());
        console.log("  MAX_CUSTODIANS    :", vault.MAX_CUSTODIANS());
        console.log("  MAX_BENEFICIARIES :", vault.MAX_BENEFICIARIES());

        if (bytes(net.explorerUrl).length > 0) {
            console.log("");
            console.log(
                "  explorer :", string.concat(net.explorerUrl, "/address/", vm.toString(address(vault)))
            );
        }

        // Only a real broadcast updates the deployment record. A dry run
        // (`forge script` without `--broadcast`) still executes this function,
        // so recording unconditionally would overwrite deployments/<chainId>.json
        // with an address that was simulated but never deployed — and the next
        // `sync-abi.sh` would then point the frontend at a contract that does
        // not exist. Dry-running before a deploy is the documented workflow, so
        // this has to be safe to do.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume)) {
            _record(net, address(vault));
        } else {
            console.log("");
            console.log("  DRY RUN - deployments/ not written, nothing broadcast.");
            console.log("  Add --broadcast to deploy for real.");
        }

        console.log("");
        console.log("Next steps:");
        console.log("  1. ./script/sync-abi.sh              # export the ABI to the frontend");
        console.log("  2. set NEXT_PUBLIC_CONTRACT_ADDRESS  # in the app's env file");
        console.log("=====================================================");
    }

    /// @dev Deployment metadata is written to `deployments/<chainId>.json` so the
    ///      frontend, the indexer and any future migration can resolve the
    ///      address without anyone hardcoding it.
    function _record(Networks.Network memory net, address vaultAddr) private {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = string.concat(
            "{\n",
            '  "network": "', net.name, '",\n',
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "contract": "VaultInheritance",\n',
            '  "address": "', vm.toString(vaultAddr), '",\n',
            '  "deployer": "', vm.toString(msg.sender), '",\n',
            '  "blockNumber": ', vm.toString(block.number), ",\n",
            '  "timestamp": ', vm.toString(block.timestamp), ",\n",
            '  "explorerUrl": "',
            bytes(net.explorerUrl).length > 0
                ? string.concat(net.explorerUrl, "/address/", vm.toString(vaultAddr))
                : "",
            '"\n',
            "}\n"
        );
        vm.writeFile(path, json);
        console.log("  recorded :", path);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Networks
/// @notice Chain metadata for the deployment scripts.
/// @dev Mirrors `config/networks.json`, which is the canonical source shared with
///      the frontend. Every value was taken from the official Robinhood Chain
///      documentation and then confirmed against the live RPC endpoints — see
///      ROBINHOOD_CHAIN.md §3. Nothing here is guessed.
///
///      Solidity cannot read JSON at compile time, so these two files must be
///      kept in step; `script/verify-network.sh` re-checks the chain IDs against
///      the live RPCs so drift is caught rather than deployed.
library Networks {
    struct Network {
        string name;
        string explorerUrl;
        bool isTestnet;
    }

    uint256 internal constant ROBINHOOD_MAINNET = 4663; // eth_chainId -> 0x1237
    uint256 internal constant ROBINHOOD_TESTNET = 46630; // eth_chainId -> 0xb626
    uint256 internal constant ANVIL = 31337;

    function current(uint256 chainId) internal pure returns (Network memory) {
        if (chainId == ROBINHOOD_MAINNET) {
            return Network({
                name: "Robinhood Chain",
                explorerUrl: "https://robinhoodchain.blockscout.com",
                isTestnet: false
            });
        }
        if (chainId == ROBINHOOD_TESTNET) {
            return Network({
                name: "Robinhood Chain Testnet",
                explorerUrl: "https://explorer.testnet.chain.robinhood.com",
                isTestnet: true
            });
        }
        if (chainId == ANVIL) {
            return Network({name: "Anvil (local)", explorerUrl: "", isTestnet: true});
        }
        // Deliberately permissive: an unknown chain still deploys (useful for a
        // fork test), it just has no explorer link.
        return Network({name: "Unknown network", explorerUrl: "", isTestnet: true});
    }
}

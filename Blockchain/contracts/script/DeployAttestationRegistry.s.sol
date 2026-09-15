// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

/**
 * Deploys AttestationRegistry. First to Anvil, then to Base Sepolia.
 *
 * Anvil:
 *   forge script contracts/script/DeployAttestationRegistry.s.sol --rpc-url anvil \
 *     --broadcast --private-key $ANVIL_TEST_PK
 * Base Sepolia:
 *   forge script contracts/script/DeployAttestationRegistry.s.sol --rpc-url base_sepolia \
 *     --broadcast --private-key $EXECUTION_SIGNER_PRIVATE_KEY
 * Then set ATTESTATION_REGISTRY_ADDRESS to the deployed address.
 */
contract DeployAttestationRegistry is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        new AttestationRegistry();
        vm.stopBroadcast();
    }
}

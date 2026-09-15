// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/**
 * Deploys TestUSDC to a local Anvil and mints to the deployer. Used only for local
 * integration; never for a real network.
 *
 * Usage:
 *   forge script contracts/script/DeployTestUSDC.s.sol --rpc-url anvil --broadcast \
 *     --private-key $ANVIL_TEST_PK
 */
contract DeployTestUSDC is Script {
    function run() external {
        uint256 pk = vm.envUint("ANVIL_TEST_PK");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        TestUSDC usdc = new TestUSDC();
        usdc.mint(deployer, 1_000_000_000); // 1000 USDC
        vm.stopBroadcast();
    }
}

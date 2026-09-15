// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

contract TestUSDCTest is Test {
    TestUSDC usdc;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        usdc = new TestUSDC();
        usdc.mint(alice, 10_000_000); // 10 USDC (6 decimals)
    }

    function test_decimals_is_6() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_transfer_moves_exact_units() public {
        vm.prank(alice);
        usdc.transfer(bob, 5_000_000);
        assertEq(usdc.balanceOf(bob), 5_000_000);
        assertEq(usdc.balanceOf(alice), 5_000_000);
    }

    function test_transfer_reverts_on_insufficient_balance() public {
        vm.prank(bob);
        vm.expectRevert(TestUSDC.InsufficientBalance.selector);
        usdc.transfer(alice, 1);
    }

    function test_transfer_reverts_when_paused() public {
        usdc.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(TestUSDC.Paused.selector);
        usdc.transfer(bob, 1);
    }
}

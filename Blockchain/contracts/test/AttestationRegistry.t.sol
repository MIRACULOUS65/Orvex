// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

contract AttestationRegistryTest is Test {
    AttestationRegistry reg;
    address attester = address(this);
    address stranger = address(0xBEEF);

    bytes32 constant EXEC = keccak256("exec-1");
    bytes32 constant ALLOW = keccak256("ALLOW");

    function setUp() public {
        reg = new AttestationRegistry();
    }

    function _attest(bytes32 execId) internal {
        reg.attest(
            execId,
            keccak256("agent"),
            keccak256("policy"),
            keccak256("intent"),
            keccak256("trajectory"),
            keccak256("assessment"),
            ALLOW,
            keccak256("txhash")
        );
    }

    function test_attest_and_read() public {
        _attest(EXEC);
        assertTrue(reg.isAttested(EXEC));
        AttestationRegistry.Attestation memory a = reg.getAttestation(EXEC);
        assertEq(a.decision, ALLOW);
        assertEq(a.attester, attester);
        assertTrue(a.timestamp > 0);
    }

    function test_double_attest_reverts() public {
        _attest(EXEC);
        vm.expectRevert(AttestationRegistry.AlreadyAttested.selector);
        _attest(EXEC);
    }

    function test_non_attester_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(AttestationRegistry.NotAttester.selector);
        _attest(EXEC);
    }

    function test_owner_can_grant_attester() public {
        reg.setAttester(stranger, true);
        vm.prank(stranger);
        _attest(keccak256("exec-2"));
        assertTrue(reg.isAttested(keccak256("exec-2")));
    }

    function test_unattested_reads_false() public view {
        assertFalse(reg.isAttested(keccak256("never")));
    }
}

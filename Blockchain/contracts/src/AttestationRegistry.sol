// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * AttestationRegistry — stores COMPACT COMMITMENTS about authorized executions.
 *
 * It records only hashes/identifiers + a decision + a transaction hash + a timestamp.
 * It MUST NOT be used to store private keys, secrets, raw prompts, full trajectories, or
 * proprietary evidence — only fixed-size commitments. This gives an on-chain, tamper-
 * evident audit anchor without leaking sensitive data.
 *
 * Design notes:
 *  - Records are append-only and keyed by `executionId` (a bytes32 id/hash from Core).
 *  - Re-attesting the same executionId is rejected (one commitment per execution).
 *  - Anyone can read; writers may be restricted to an allow-list in production. For the
 *    testnet reference we keep an owner-settable attester to keep it minimal.
 */
contract AttestationRegistry {
    struct Attestation {
        bytes32 agentId;
        bytes32 policyHash;
        bytes32 intentRef;
        bytes32 trajectoryRoot;
        bytes32 assessmentHash;
        bytes32 decision; // e.g. keccak256("ALLOW")
        bytes32 transactionHash;
        uint64 timestamp;
        address attester;
        bool exists;
    }

    address public owner;
    mapping(address => bool) public isAttester;
    mapping(bytes32 => Attestation) private attestations;

    event Attested(
        bytes32 indexed executionId,
        bytes32 indexed agentId,
        bytes32 decision,
        bytes32 transactionHash,
        uint64 timestamp
    );
    event AttesterSet(address indexed attester, bool allowed);

    error NotOwner();
    error NotAttester();
    error AlreadyAttested();

    constructor() {
        owner = msg.sender;
        isAttester[msg.sender] = true;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setAttester(address attester, bool allowed) external onlyOwner {
        isAttester[attester] = allowed;
        emit AttesterSet(attester, allowed);
    }

    function attest(
        bytes32 executionId,
        bytes32 agentId,
        bytes32 policyHash,
        bytes32 intentRef,
        bytes32 trajectoryRoot,
        bytes32 assessmentHash,
        bytes32 decision,
        bytes32 transactionHash
    ) external {
        if (!isAttester[msg.sender]) revert NotAttester();
        if (attestations[executionId].exists) revert AlreadyAttested();

        attestations[executionId] = Attestation({
            agentId: agentId,
            policyHash: policyHash,
            intentRef: intentRef,
            trajectoryRoot: trajectoryRoot,
            assessmentHash: assessmentHash,
            decision: decision,
            transactionHash: transactionHash,
            timestamp: uint64(block.timestamp),
            attester: msg.sender,
            exists: true
        });

        emit Attested(executionId, agentId, decision, transactionHash, uint64(block.timestamp));
    }

    function getAttestation(bytes32 executionId) external view returns (Attestation memory) {
        return attestations[executionId];
    }

    function isAttested(bytes32 executionId) external view returns (bool) {
        return attestations[executionId].exists;
    }
}

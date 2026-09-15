// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * TestUSDC — a minimal 6-decimal ERC-20 used ONLY for local Anvil integration tests.
 * It mimics USDC's decimals and the standard transfer/approve semantics. Not for any
 * real network. `mint` is open so tests can fund accounts deterministically.
 */
contract TestUSDC {
    string public constant name = "Test USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bool public paused;
    address public immutable owner;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error Paused();

    constructor() {
        owner = msg.sender;
    }

    function setPaused(bool p) external {
        require(msg.sender == owner, "not owner");
        paused = p;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (paused) revert Paused();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (paused) revert Paused();
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (balanceOf[from] < amount) revert InsufficientBalance();
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

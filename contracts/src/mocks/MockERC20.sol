// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Minimal, well-behaved ERC-20 for tests.
/// @dev Deliberately hand-written rather than pulled from OpenZeppelin so the
///      adversarial variants below can inherit and misbehave in exactly one way
///      each.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 amount) public virtual {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external virtual returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        virtual
        returns (bool)
    {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "ERC20: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal virtual {
        require(balanceOf[from] >= amount, "ERC20: insufficient balance");
        unchecked {
            balanceOf[from] -= amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @notice Takes a percentage fee on every transfer.
/// @dev The single most important adversarial case for this migration. SPL's
///      `transfer_checked` always moves exactly the requested amount, so the
///      Solana program could credit `amount` directly. An ERC-20 cannot be
///      trusted that way, which is why `depositToken` credits the MEASURED
///      balance delta. These tests prove the ledger never over-credits.
contract FeeOnTransferERC20 is MockERC20 {
    uint256 public feeBps;

    constructor(uint256 _feeBps) MockERC20("Fee", "FEE", 18) {
        feeBps = _feeBps;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        uint256 fee = (amount * feeBps) / 10_000;
        require(balanceOf[from] >= amount, "ERC20: insufficient balance");
        unchecked {
            balanceOf[from] -= amount;
        }
        balanceOf[to] += amount - fee;
        // The fee is burned rather than routed, so totalSupply stays honest.
        totalSupply -= fee;
        emit Transfer(from, to, amount - fee);
    }
}

/// @notice Returns no data at all from transfer/transferFrom (USDT-style).
/// @dev `SafeERC20` must tolerate this. A naive `IERC20(t).transfer(...)` call
///      would revert on the ABI decode.
contract NoReturnERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public constant decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transfer(address to, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "bal");
        unchecked {
            balanceOf[msg.sender] -= amount;
        }
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(allowance[from][msg.sender] >= amount, "allow");
        require(balanceOf[from] >= amount, "bal");
        unchecked {
            allowance[from][msg.sender] -= amount;
            balanceOf[from] -= amount;
        }
        balanceOf[to] += amount;
    }
}

/// @notice Returns `false` instead of reverting on a failed transfer.
/// @dev `SafeERC20` must turn this into a revert; otherwise a "successful"
///      claim could move nothing while still burning the heir's one-shot guard.
contract FalseReturnERC20 is MockERC20 {
    bool public failTransfers;

    constructor() MockERC20("False", "FLS", 18) {}

    function setFailTransfers(bool v) external {
        failTransfers = v;
    }

    function transfer(address, uint256) external view override returns (bool) {
        return !failTransfers;
    }

    function transferFrom(address, address, uint256) external view override returns (bool) {
        return !failTransfers;
    }
}

interface IReentrancyTarget {
    function claimToken(address owner, address token) external;
    function depositToken(address token, uint256 amount) external;
    function withdrawToken(address token) external;
    function sweepTokenVault(address owner, address token) external;
}

/// @notice Calls back into the vault from inside `transfer`.
/// @dev The ERC-777-style hazard that SPL Token simply does not have: an ERC-20
///      is arbitrary code, so every value-moving path must survive being
///      re-entered mid-transfer.
contract ReentrantERC20 is MockERC20 {
    IReentrancyTarget public target;
    address public willOwner;
    uint8 public mode; // 0 = off, 1 = claimToken, 2 = withdrawToken, 3 = sweep
    bool private _entered;

    constructor() MockERC20("Reentrant", "RE", 18) {}

    function arm(IReentrancyTarget t, address owner, uint8 m) external {
        target = t;
        willOwner = owner;
        mode = m;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        super._transfer(from, to, amount);
        if (mode != 0 && !_entered && address(target) != address(0)) {
            _entered = true;
            if (mode == 1) target.claimToken(willOwner, address(this));
            else if (mode == 2) target.withdrawToken(address(this));
            else if (mode == 3) target.sweepTokenVault(willOwner, address(this));
            _entered = false;
        }
    }
}

/// @notice Reverts on every transfer once armed.
/// @dev Models a token with a blocklist or a paused transfer function. Used to
///      show that a failed sweep leaves the vault intact and retryable rather
///      than silently losing the balance.
contract BlockingERC20 is MockERC20 {
    mapping(address => bool) public blocked;

    constructor() MockERC20("Blocking", "BLK", 18) {}

    function setBlocked(address who, bool v) external {
        blocked[who] = v;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        require(!blocked[to] && !blocked[from], "blocked");
        super._transfer(from, to, amount);
    }
}

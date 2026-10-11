// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Nontransferable NFT tickets, paid in six-decimal USDC and escrowed until settlement.
/// @dev The app records check-in; no onchain actor can mark a ticket used.
contract EventTicket is ERC721, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ORGANIZER_ROLE = keccak256("ORGANIZER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant FEE_BPS = 200;
    uint256 public constant BPS = 10_000;

    struct EventInfo {
        address organizer;
        uint256 price;
        uint256 maxSupply;
        uint256 sold;
        uint64 saleStart;
        uint64 saleEnd;
        uint64 startsAt;
        uint64 endsAt;
        bool canceled;
        uint256 gross;
        uint256 fees;
        uint256 refunded;
        uint256 organizerWithdrawn;
        uint256 platformWithdrawn;
    }

    IERC20 public immutable usdc;
    address public immutable feeRecipient;
    uint256 public nextEventId = 1;
    uint256 public nextTokenId = 1;
    uint256 public totalEscrowed;
    mapping(uint256 => EventInfo) public events;
    mapping(uint256 => uint256) public ticketEvent;
    mapping(uint256 => address) public originalBuyer;
    mapping(uint256 => bool) public refundedTicket;
    mapping(bytes32 => bool) public usedReference;

    event EventCreated(uint256 indexed eventId, address indexed organizer, bytes32 indexed referenceHash, uint256 price, uint256 maxSupply, uint64 saleStart, uint64 saleEnd, uint64 startsAt, uint64 endsAt);
    event TicketPurchased(uint256 indexed eventId, uint256 indexed tokenId, address indexed buyer, uint256 price, uint256 fee);
    event EventCanceled(uint256 indexed eventId);
    event TicketRefunded(uint256 indexed eventId, uint256 indexed tokenId, address indexed buyer, uint256 amount);
    event ProceedsWithdrawn(uint256 indexed eventId, address indexed organizer, uint256 amount);
    event PlatformFeeWithdrawn(uint256 indexed eventId, address indexed recipient, uint256 amount);

    error InvalidConfiguration(); error InvalidSchedule(); error NotOrganizer(); error SaleClosed(); error SoldOut();
    error EventNotFound(); error EventAlreadyCanceled(); error CancellationClosed(); error NotCanceled();
    error NotOriginalBuyer(); error AlreadyRefunded(); error SettlementUnavailable(); error NothingToWithdraw();
    error TransfersDisabled(); error IncorrectPaymentReceived();

    constructor(address usdcAddress, address admin, address feeRecipientAddress) ERC721("EventPass Ticket", "EPASS") {
        if (usdcAddress == address(0) || usdcAddress.code.length == 0 || admin == address(0) || feeRecipientAddress == address(0)) revert InvalidConfiguration();
        if (IERC20Metadata(usdcAddress).decimals() != 6) revert InvalidConfiguration();
        usdc = IERC20(usdcAddress);
        feeRecipient = feeRecipientAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function createEvent(bytes32 referenceHash, uint256 price, uint256 maxSupply, uint64 saleStart, uint64 saleEnd, uint64 startsAt, uint64 endsAt)
        external onlyRole(ORGANIZER_ROLE) whenNotPaused returns (uint256 eventId)
    {
        if (referenceHash == bytes32(0) || usedReference[referenceHash] || price == 0 || maxSupply == 0) revert InvalidConfiguration();
        if (!(saleStart < saleEnd && saleEnd <= startsAt && startsAt < endsAt && endsAt > block.timestamp)) revert InvalidSchedule();
        eventId = nextEventId++;
        usedReference[referenceHash] = true;
        events[eventId] = EventInfo({organizer:msg.sender,price:price,maxSupply:maxSupply,sold:0,saleStart:saleStart,saleEnd:saleEnd,startsAt:startsAt,endsAt:endsAt,canceled:false,gross:0,fees:0,refunded:0,organizerWithdrawn:0,platformWithdrawn:0});
        emit EventCreated(eventId,msg.sender,referenceHash,price,maxSupply,saleStart,saleEnd,startsAt,endsAt);
    }

    function purchase(uint256 eventId) external nonReentrant whenNotPaused returns (uint256 tokenId) {
        EventInfo storage e = _event(eventId);
        if (e.canceled || block.timestamp < e.saleStart || block.timestamp > e.saleEnd) revert SaleClosed();
        if (e.sold >= e.maxSupply) revert SoldOut();
        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), e.price);
        if (usdc.balanceOf(address(this)) - balanceBefore != e.price) revert IncorrectPaymentReceived();
        uint256 fee = e.price * FEE_BPS / BPS;
        e.sold++;
        e.gross += e.price;
        e.fees += fee;
        totalEscrowed += e.price;
        tokenId = nextTokenId++;
        ticketEvent[tokenId] = eventId;
        originalBuyer[tokenId] = msg.sender;
        _safeMint(msg.sender, tokenId);
        emit TicketPurchased(eventId, tokenId, msg.sender, e.price, fee);
    }

    function cancelEvent(uint256 eventId) external nonReentrant {
        EventInfo storage e = _event(eventId);
        if (msg.sender != e.organizer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotOrganizer();
        if (e.canceled) revert EventAlreadyCanceled();
        if (block.timestamp >= e.startsAt) revert CancellationClosed();
        e.canceled = true;
        emit EventCanceled(eventId);
    }

    /// @notice Original buyer receives the full ticket price, including the platform fee.
    function claimRefund(uint256 tokenId) external nonReentrant {
        uint256 eventId = ticketEvent[tokenId];
        EventInfo storage e = _event(eventId);
        if (!e.canceled) revert NotCanceled();
        if (originalBuyer[tokenId] != msg.sender) revert NotOriginalBuyer();
        if (refundedTicket[tokenId]) revert AlreadyRefunded();
        refundedTicket[tokenId] = true;
        e.refunded += e.price;
        totalEscrowed -= e.price;
        _burn(tokenId);
        usdc.safeTransfer(msg.sender, e.price);
        emit TicketRefunded(eventId,tokenId,msg.sender,e.price);
    }

    function withdrawProceeds(uint256 eventId) external nonReentrant whenNotPaused {
        EventInfo storage e = _event(eventId);
        if (msg.sender != e.organizer) revert NotOrganizer();
        _requireSettlement(e);
        uint256 due = e.gross - e.fees - e.organizerWithdrawn;
        if (due == 0) revert NothingToWithdraw();
        e.organizerWithdrawn += due;
        totalEscrowed -= due;
        usdc.safeTransfer(msg.sender,due);
        emit ProceedsWithdrawn(eventId,msg.sender,due);
    }

    function withdrawPlatformFees(uint256 eventId) external nonReentrant whenNotPaused onlyRole(DEFAULT_ADMIN_ROLE) {
        EventInfo storage e = _event(eventId);
        _requireSettlement(e);
        uint256 due = e.fees - e.platformWithdrawn;
        if (due == 0) revert NothingToWithdraw();
        e.platformWithdrawn += due;
        totalEscrowed -= due;
        usdc.safeTransfer(feeRecipient,due);
        emit PlatformFeeWithdrawn(eventId,feeRecipient,due);
    }

    function refundableAmount(uint256 eventId) external view returns (uint256) { EventInfo storage e = _event(eventId); return e.canceled ? e.gross - e.refunded : 0; }
    function eventAvailability(uint256 eventId) external view returns (uint256 price, uint256 maxSupply, uint256 sold, uint64 saleStart, uint64 saleEnd, bool canceled) {
        EventInfo storage e = _event(eventId); return (e.price,e.maxSupply,e.sold,e.saleStart,e.saleEnd,e.canceled);
    }
    function eventFinancials(uint256 eventId) external view returns (uint256 gross, uint256 fees, uint256 refunded, uint256 organizerWithdrawn, uint256 platformWithdrawn) {
        EventInfo storage e = _event(eventId); return (e.gross,e.fees,e.refunded,e.organizerWithdrawn,e.platformWithdrawn);
    }
    function settlementAvailable(uint256 eventId) external view returns (uint256 organizerDue, uint256 platformDue) {
        EventInfo storage e = _event(eventId);
        if (!e.canceled && block.timestamp > e.endsAt) { organizerDue = e.gross - e.fees - e.organizerWithdrawn; platformDue = e.fees - e.platformWithdrawn; }
    }
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }
    function _requireSettlement(EventInfo storage e) internal view { if (e.canceled || block.timestamp <= e.endsAt) revert SettlementUnavailable(); }
    function _event(uint256 eventId) internal view returns (EventInfo storage e) { e = events[eventId]; if (e.organizer == address(0)) revert EventNotFound(); }

    /// @dev Minting and refund burning are allowed; all wallet-to-wallet transfers are blocked.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert TransfersDisabled();
        return super._update(to,tokenId,auth);
    }
    function approve(address, uint256) public pure override { revert TransfersDisabled(); }
    function setApprovalForAll(address, bool) public pure override { revert TransfersDisabled(); }
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) { return super.supportsInterface(interfaceId); }
}

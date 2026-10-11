// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {EventTicket} from "../src/EventTicket.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
}

contract EventTicketTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ADMIN = address(0xA11CE);
    address constant ORGANIZER = address(0xB0B);
    address constant BUYER = address(0xCAFE);
    address constant TREASURY = address(0xFEE);
    MockUSDC usdc;
    EventTicket ticket;
    uint256 eventId;
    uint256 constant PRICE = 25_000_000;

    function setUp() public {
        usdc = new MockUSDC();
        ticket = new EventTicket(address(usdc), ADMIN, TREASURY);
        bytes32 organizerRole = ticket.ORGANIZER_ROLE();
        vm.prank(ADMIN);
        ticket.grantRole(organizerRole, ORGANIZER);
        usdc.mint(BUYER, 1_000_000_000_000);
        vm.prank(BUYER);
        usdc.approve(address(ticket), type(uint256).max);
        vm.prank(ORGANIZER);
        eventId = ticket.createEvent(keccak256("event-1"), PRICE, 2, 100, 200, 300, 400);
    }

    function _buy() internal returns (uint256) { vm.warp(100); vm.prank(BUYER); return ticket.purchase(eventId); }
    function _eq(uint256 a, uint256 b) internal pure { require(a == b, "not equal"); }

    function testOnlyApprovedOrganizersCreate() public {
        vm.prank(BUYER); vm.expectRevert();
        ticket.createEvent(keccak256("bad"), PRICE, 2, 100, 200, 300, 400);
    }
    function testPriceUsdcTransferAndFee() public {
        uint256 beforeBuyer = usdc.balanceOf(BUYER);
        uint256 tokenId = _buy();
        _eq(beforeBuyer - usdc.balanceOf(BUYER), PRICE);
        _eq(usdc.balanceOf(address(ticket)), PRICE);
        _eq(ticket.totalEscrowed(), PRICE);
        require(ticket.ownerOf(tokenId) == BUYER, "owner");
        (uint256 organizerDue, uint256 platformDue) = ticket.settlementAvailable(eventId);
        _eq(organizerDue, 0); _eq(platformDue, 0);
        vm.warp(401);
        (organizerDue, platformDue) = ticket.settlementAvailable(eventId);
        _eq(platformDue, 500_000); _eq(organizerDue, 24_500_000);
    }
    function testMaxSupplyCannotBeExceeded() public { _buy(); _buy(); vm.prank(BUYER); vm.expectRevert(EventTicket.SoldOut.selector); ticket.purchase(eventId); }
    function testSaleWindow() public {
        vm.warp(99); vm.prank(BUYER); vm.expectRevert(EventTicket.SaleClosed.selector); ticket.purchase(eventId);
        vm.warp(201); vm.prank(BUYER); vm.expectRevert(EventTicket.SaleClosed.selector); ticket.purchase(eventId);
    }
    function testCancellationRefundAndDoubleClaim() public {
        uint256 tokenId = _buy();
        vm.prank(ORGANIZER); ticket.cancelEvent(eventId);
        vm.prank(BUYER); ticket.claimRefund(tokenId);
        _eq(usdc.balanceOf(address(ticket)), 0); _eq(ticket.totalEscrowed(), 0);
        _eq(ticket.refundableAmount(eventId), 0);
        vm.prank(BUYER); vm.expectRevert(EventTicket.AlreadyRefunded.selector); ticket.claimRefund(tokenId);
    }
    function testUnauthorizedAndEarlyWithdrawal() public {
        _buy();
        vm.prank(BUYER); vm.expectRevert(EventTicket.NotOrganizer.selector); ticket.withdrawProceeds(eventId);
        vm.prank(ORGANIZER); vm.expectRevert(EventTicket.SettlementUnavailable.selector); ticket.withdrawProceeds(eventId);
        vm.prank(BUYER); vm.expectRevert(); ticket.withdrawPlatformFees(eventId);
    }
    function testSettlementMatchesEscrow() public {
        _buy(); _buy(); vm.warp(401);
        vm.prank(ORGANIZER); ticket.withdrawProceeds(eventId);
        _eq(usdc.balanceOf(ORGANIZER), 49_000_000); _eq(ticket.totalEscrowed(), 1_000_000);
        vm.prank(ADMIN); ticket.withdrawPlatformFees(eventId);
        _eq(usdc.balanceOf(TREASURY), 1_000_000); _eq(ticket.totalEscrowed(), 0);
        _eq(usdc.balanceOf(address(ticket)), 0);
        vm.prank(ORGANIZER); vm.expectRevert(EventTicket.NothingToWithdraw.selector); ticket.withdrawProceeds(eventId);
    }
    function testNoTransfersAndApprovals() public {
        uint256 tokenId = _buy();
        vm.prank(BUYER); vm.expectRevert(EventTicket.TransfersDisabled.selector); ticket.transferFrom(BUYER, ORGANIZER, tokenId);
        vm.prank(BUYER); vm.expectRevert(EventTicket.TransfersDisabled.selector); ticket.approve(ORGANIZER, tokenId);
    }
    function testPauseBlocksSalesAndSettlementButRefundsWork() public {
        vm.prank(ADMIN); ticket.pause();
        vm.warp(100); vm.prank(BUYER); vm.expectRevert(); ticket.purchase(eventId);
        vm.prank(ADMIN); ticket.unpause();
        uint256 tokenId = _buy();
        vm.prank(ORGANIZER); ticket.cancelEvent(eventId);
        vm.prank(ADMIN); ticket.pause();
        vm.prank(BUYER); ticket.claimRefund(tokenId);
        _eq(ticket.totalEscrowed(), 0);
    }
    function testFuzzPriceAndEscrow(uint96 rawPrice, uint8 rawSupply) public {
        uint256 price = uint256(rawPrice) % 1_000_000_000 + 1;
        uint256 supply = uint256(rawSupply) % 8 + 1;
        vm.prank(ORGANIZER);
        uint256 id = ticket.createEvent(keccak256(abi.encode(price,supply)), price, supply, 100, 200, 300, 400);
        vm.warp(100);
        uint256 bought;
        for (uint256 i; i < supply; i++) { vm.prank(BUYER); ticket.purchase(id); bought++; }
        _eq(usdc.balanceOf(address(ticket)), PRICE * 0 + price * bought);
        _eq(ticket.totalEscrowed(), price * bought);
        vm.warp(401);
        (uint256 organizerDue, uint256 platformDue) = ticket.settlementAvailable(id);
        _eq(organizerDue + platformDue, price * bought);
    }
}

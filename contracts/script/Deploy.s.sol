// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {EventTicket} from "../src/EventTicket.sol";
interface Vm { function envAddress(string calldata) external returns (address); function startBroadcast() external; function stopBroadcast() external; }
contract Deploy {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function run() external returns (EventTicket deployed) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address treasury = vm.envAddress("FEE_RECIPIENT_ADDRESS");
        vm.startBroadcast();
        deployed = new EventTicket(usdc, admin, treasury);
        vm.stopBroadcast();
    }
}

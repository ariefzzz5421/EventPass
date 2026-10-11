import { createPublicClient, http, isAddress, parseAbi } from "viem";
import { baseSepolia } from "@/lib/network";
export const ticketAbi = parseAbi([
  "function ORGANIZER_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function usdc() view returns (address)",
  "function hasRole(bytes32 role,address account) view returns (bool)",
  "function createEvent(bytes32 referenceHash,uint256 price,uint256 maxSupply,uint64 saleStart,uint64 saleEnd,uint64 startsAt,uint64 endsAt) returns (uint256)",
  "function purchase(uint256 eventId) returns (uint256)",
  "function claimRefund(uint256 tokenId)",
  "function cancelEvent(uint256 eventId)",
  "function withdrawProceeds(uint256 eventId)",
  "function grantRole(bytes32 role,address account)",
  "function withdrawPlatformFees(uint256 eventId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function ticketEvent(uint256 tokenId) view returns (uint256)",
  "function refundedTicket(uint256 tokenId) view returns (bool)",
  "function eventAvailability(uint256 eventId) view returns (uint256 price,uint256 maxSupply,uint256 sold,uint64 saleStart,uint64 saleEnd,bool canceled)",
  "function eventFinancials(uint256 eventId) view returns (uint256 gross,uint256 fees,uint256 refunded,uint256 organizerWithdrawn,uint256 platformWithdrawn)",
  "function settlementAvailable(uint256 eventId) view returns (uint256 organizerDue,uint256 platformDue)",
  "function refundableAmount(uint256 eventId) view returns (uint256)",
  "event EventCreated(uint256 indexed eventId,address indexed organizer,bytes32 indexed referenceHash,uint256 price,uint256 maxSupply,uint64 saleStart,uint64 saleEnd,uint64 startsAt,uint64 endsAt)",
  "event TicketPurchased(uint256 indexed eventId,uint256 indexed tokenId,address indexed buyer,uint256 price,uint256 fee)",
  "event EventCanceled(uint256 indexed eventId)",
  "event TicketRefunded(uint256 indexed eventId,uint256 indexed tokenId,address indexed buyer,uint256 amount)",
  "event ProceedsWithdrawn(uint256 indexed eventId,address indexed organizer,uint256 amount)",
  "event PlatformFeeWithdrawn(uint256 indexed eventId,address indexed recipient,uint256 amount)"
]);
export const erc20Abi = parseAbi(["function balanceOf(address account) view returns (uint256)","function allowance(address owner,address spender) view returns (uint256)","function approve(address spender,uint256 amount) returns (bool)","function decimals() view returns (uint8)"]);
export const publicClient = createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org")});
export function ticketAddress(): `0x${string}` { const value=process.env.NEXT_PUBLIC_EVENT_TICKET_ADDRESS; if(!value || !isAddress(value)) throw new Error("EventTicket contract is not configured"); return value as `0x${string}`; }
export function usdcAddress(): `0x${string}` { const value=process.env.NEXT_PUBLIC_USDC_ADDRESS; if(!value || !isAddress(value)) throw new Error("USDC contract is not configured"); return value as `0x${string}`; }
export const explorerTx = (hash: string) => `https://sepolia.basescan.org/tx/${hash}`;
export const explorerAddress = (address: string) => `https://sepolia.basescan.org/address/${address}`;
export async function verifyChainConfiguration(){const [chainId,code,configuredUsdc,decimals]=await Promise.all([publicClient.getChainId(),publicClient.getCode({address:ticketAddress()}),publicClient.readContract({address:ticketAddress(),abi:ticketAbi,functionName:"usdc"}),publicClient.readContract({address:usdcAddress(),abi:erc20Abi,functionName:"decimals"})]);if(chainId!==84532||!code||configuredUsdc.toLowerCase()!==usdcAddress().toLowerCase()||decimals!==6)throw new Error("Base Sepolia contract or six-decimal USDC configuration mismatch")}

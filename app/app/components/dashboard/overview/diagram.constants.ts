export interface StateDetails {
  title: string;
  description: string;
  activeNodes: string[]; // "owner", "ipfs", "will", "custodians", "heirs"
  activePaths: string[]; // "owner_will", "owner_ipfs", "custodian_will", "will_heir", "ipfs_heir"
  particleColor: string;
}

export const STATES: StateDetails[] = [
  {
    title: "1. Seal Will & Assets",
    description:
      "Owner encrypts private documents, uploads them to IPFS, and binds the resulting CIDs to their on-chain will.",
    activeNodes: ["owner", "ipfs", "will"],
    activePaths: ["owner_ipfs", "owner_will"],
    particleColor: "var(--neon)",
  },
  {
    title: "2. Active Time Lock",
    description:
      "Will account is locked on-chain. Periodic 'check-in' heartbeats from the owner's wallet reset the inactivity timer.",
    activeNodes: ["owner", "will"],
    activePaths: ["owner_will"],
    particleColor: "var(--neon)",
  },
  {
    title: "3. Custodian Quorum",
    description:
      "Inactivity timer expires. Designated custodians submit passing confirmations on-chain to unlock the estate release.",
    activeNodes: ["custodians", "will"],
    activePaths: ["custodian_will"],
    particleColor: "#fbbf24",
  },
  {
    title: "4. Release & Decrypt",
    description:
      "The custodian quorum is met. Heirs claim their estate share and download/decrypt sealed IPFS media.",
    activeNodes: ["will", "ipfs", "heirs"],
    activePaths: ["will_heir", "ipfs_heir"],
    particleColor: "#ec4899",
  },
];

# User guide

How to use the Blop dashboard. The guide is organised by role. Names of pages
and buttons match what the app shows. For how the protocol works in general,
read the [overview](./overview.md).

## Before you start

**Wallet.** Use an EVM browser wallet (MetaMask, Rabby, etc.). Wallets appear in
the connect menu if they announce themselves to the browser. WalletConnect (QR
code) is available only if the site operator configured it. If the button reads
"No wallet found", no usable wallet was detected.

**Network.** The app works on one network, shown next to the connect button in
the page header (for example "Robinhood Chain Testnet"). If your wallet is on a
different network, the button changes to **Switch to {network}**. Click it
before doing anything else. You need a little ETH on that network to pay for
transactions.

**Two kinds of signature request.** Besides normal transactions, the app asks
you to sign two messages. Neither moves funds.

| Message starts with | Why | How often |
|---|---|---|
| "Sign in to Vault Inheritance" | Proves to the app's server that you control the wallet, so it lets you upload or view documents | Once every 12 hours, or when the session expires |
| "vault-inheritance: derive document encryption key (v1)" | Produces your document key in the browser. The key never leaves your device. | Once per page load when a document key is needed. The first time in a browser tab you are asked **twice**, so the app can check that your wallet always gives the same signature. |

If your wallet produces a different signature each time, the app stops with an
error saying it "cannot derive a stable document key". Use a different wallet.

## Dashboard map

Open `/dashboard`. The sidebar has these entries:

| Sidebar | Page title | Used by |
|---|---|---|
| Overview | Dashboard Overview | Owner |
| Beneficiaries | Manage Heirs & Shares | Owner |
| Files & Documents | Secure Documents Vault | Owner |
| Custodians | Will Custodians | Owner |
| Token Escrow | Asset Distribution | Owner |
| My Inheritance | My Inheritance | Beneficiary |
| Intervene & Claim | Intervention & Claim Console | Custodian, beneficiary |
| Will Settings | Vault Configuration | Owner |

Until you create a will, the owner pages show a checklist titled "Finish setting
up your will before you …" with links to each missing step.

## Timeline

Durations for the grace period and claim window are fixed in the contract
(`GRACE_PERIOD = 7 days`, `CLAIM_WINDOW = 90 days`).

| Phase | Starts | Length | Owner | Custodians | Beneficiaries |
|---|---|---|---|---|---|
| Active | Will created, or the owner's last check-in | Your inactivity threshold | Manage everything, check in | Nothing yet | Register document key |
| Confirming (status `pendingInheritance`) | First custodian confirms, after the threshold has passed | Until enough custodians confirm | Can cancel. All other changes are locked | Confirm | Wait |
| Grace period (status `claimable`) | Required number of confirmations reached | 7 days | Can still cancel | Nothing | Wait. Claims are rejected |
| Claim window | Grace period ends | 90 days | Nothing | Nothing | Claim tokens, open documents |
| Window closed | Claim window ends | No limit | Nothing | Nothing | Unclaimed shares can be swept back to the owner's address by anyone |

Only three things reset the owner's inactivity timer: creating the will, saving
settings or checking in (both call the same contract function), and cancelling
a death confirmation. Adding custodians, heirs, tokens or documents does **not**
reset it.

---

## Owner

### 1. Connect and create a will

1. Connect your wallet and open **Will Settings**.
2. Under "Create your digital will", fill in:
   - **Inactivity threshold (days).** How long you can go without checking in
     before custodians may confirm your death. Default 365.
   - **Required custodian approvals.** How many custodians must confirm.
     Default 1.
3. Click **Create will on-chain** and approve the transaction.

Each wallet can have one will.

### 2. Add custodians

Open **Custodians**.

1. Paste an address into **Wallet address** under "Add a custodian".
2. Click **Add custodian**.

Custodians can only confirm your death. They cannot read your documents or move
tokens. The "Confirmation requirement" card shows "N of M custodians". If you
require more approvals than you have custodians, it warns "Quorum cannot be
reached". **Modify** takes you to Will Settings.

To remove someone, click **Remove** on their row. Removal is blocked if it would
leave fewer custodians than your required approvals; lower the requirement
first. Up to 32 custodians are allowed.

### 3. Add beneficiaries and shares

Open **Beneficiaries**.

1. Enter **Beneficiary wallet address** and **Allocation share (%)**. Shares can
   go to two decimal places. **Assign the remaining X%** fills in whatever is left.
2. Click **Add heir with X% share**.

Things to know:

- The percentage applies to **escrowed tokens only**. Every beneficiary who can
  decrypt a document gets it in full.
- The **Estate allocated** bar shows the total. Any unassigned percentage cannot
  be claimed by anyone. After the claim window it can be swept back to your own
  address.
- To change a share, remove the heir with **Remove** and add them again.
- Up to 64 beneficiaries are allowed.
- Each heir row shows **Key registered** or **No document key**.

### 4. Have heirs register document keys before you upload

Documents are encrypted for the people who can receive them **at the moment you
upload**. An heir with **No document key** at upload time can never open that
document, unless you upload it again after they register. Ask each heir to
connect their wallet and click **Register key** (see [Beneficiary](#beneficiary)).

### 5. Deposit tokens

Open **Token Escrow**. The form is disabled until at least one custodian exists
and the approval requirement can be met ("Setup Required").

1. Paste the token contract into **ERC-20 Token Contract Address**. The app looks
   the token up and shows "Token Resolved: SYMBOL (N decimals)". Addresses that
   do not answer `decimals()` are refused.
2. Enter **Amount to Escrow**. It cannot exceed your wallet balance.
3. Click **Escrow Token**. You may get **two** wallet prompts:
   - an approval for exactly that amount, if the contract's current allowance
     is too low, then
   - the deposit itself.

"Top up an existing escrow" lists tokens you already escrowed, so you can select
one instead of pasting the address again. Native ETH is not supported directly:
wrap it to WETH and escrow the WETH contract. Up to 32 different tokens are
allowed.

**Withdraw:** in "Active Token Escrows", click the trash icon on a token, then
**Confirm**. This returns the whole remaining balance of that token to you.
Withdrawals are only possible while the will is active.

### 6. Upload documents

Open **Files & Documents**. Uploads are locked ("Uploads are locked until your
will can reach quorum") until custodians are set up.

1. Drag a file onto the drop area, or click **browse**. Maximum 25 MB per file,
   and 200 MB per wallet per hour.
2. Click **Seal & Upload File**. The app will:
   - ask you to sign in, if needed,
   - ask for your document key signature,
   - encrypt the file in your browser for you and every heir who has a
     registered key,
   - upload the encrypted file, and
   - ask you to approve a transaction that records it on-chain.
3. A toast confirms "encrypted and sealed on-chain for N recipients".

If some heirs have no key yet, a warning above the drop area lists their
addresses.

Each row in "Your Sealed Documents" has a menu:

| Menu item | What it does |
|---|---|
| **Preview** | Downloads and decrypts the file in your browser. Images, video, audio, PDF and text preview inline. Other types show **Download File**. |
| **Edit Name** | Changes the label stored with the pinning service. The encrypted file is unchanged. |
| **Remove** | Opens "Delete Document". **Confirm Delete** removes the on-chain reference (a transaction), then asks the server to unpin the file. |

The filename you upload is stored as the label at the pinning service. Do not
put anything secret in a filename.

### 7. Check in (stay active)

On **Overview**, the countdown card shows "Time until will becomes claimable"
and a status of "Active & Healthy", "At Risk - Check in soon" (less than 20% of
the window left) or "Inactivity Window Expired".

Click **Reset Timer (Check In)** and approve the transaction. Clicking
**Update Settings** on Will Settings also resets the timer.

When the countdown reaches zero, the will does not change by itself. It means
custodians are now **allowed** to confirm your death.

### 8. Change settings

On **Will Settings**, "Current will settings" shows what is stored on-chain.
Under "Change settings", edit **Inactivity threshold (days)** and/or **Required
custodian approvals**, then click **Update Settings**. **Revert to current
values** discards your edits. Settings can only be changed while the will is
active.

### 9. Cancel a wrong death confirmation

If any custodian has confirmed, a red banner appears at the top of **every**
dashboard page:

- "A custodian has started death confirmation" (not enough confirmations yet), or
- "Your custodians have confirmed your death", with "Time left to cancel".

Click **I'm alive — cancel this** and approve. This:

- returns the will to active,
- discards every confirmation so far, and
- restarts your inactivity timer.

You can cancel at any time before the required number is reached, and for 7 days
after it is reached. After that the banner says it "can no longer be cancelled
on-chain".

While a confirmation is in progress, every other owner action is locked, and the
Overview shows "Will Locked — Status: …".

### 10. Delete the will

**Will Settings** → "Danger Zone" → **Deactivate & Delete Will**, then confirm
"Are you sure?". The contract refuses unless you have first:

- withdrawn every escrowed token, and
- removed every document, custodian and beneficiary.

---

## Custodian

### Find wills that name you

Open **Intervene & Claim**. With your wallet connected, "As Custodian" lists every
will that names you. The list comes straight from the contract, and you do not
need to accept an invitation. Each card shows the owner's short address, status,
and "Confirmed passing" or "Not confirmed". Click a card to load it.

You can also type an owner's address into **Or enter a will owner's address
manually**.

### Confirm death

After loading a will, "Your Role: Custodian" appears.

| Situation | What you see |
|---|---|
| Owner's inactivity threshold has not passed | "The owner's inactivity window has not elapsed yet…" with the date you become eligible |
| Threshold passed, you have not confirmed, status is not `claimable` | **Confirm passing (Death)**, which asks for confirmation before sending |
| You already confirmed | "You have already confirmed this person's death…" |

Rules enforced by the contract:

- You may confirm only after the owner has been inactive for longer than their
  threshold.
- Each custodian counts once per round. If the owner cancels, all confirmations
  are discarded. You may confirm again if the owner then goes quiet past the
  threshold a second time.
- Once enough custodians confirm, the will becomes claimable and the owner has
  7 days to cancel.

Only confirm if you have verified the owner has died.

---

## Beneficiary

### Find wills that name you

Open **My Inheritance**. Every will that names your wallet is listed, most urgent
first. Each card shows a status pill:

| Pill | Meaning |
|---|---|
| Owner active | Owner is still checking in |
| Confirming | Some custodians have confirmed; more are needed |
| Grace period | Confirmation complete; claims open when the owner's 7-day cancel window ends |
| Claimable now | You can claim |
| Window closed | The 90-day claim window has ended |

Other pills: **Key needed**, **Claimed**, and "N days left" when the claim window
closes within 14 days. Banners at the top summarise anything urgent. Click a card
to open its detail page.

The same wills also appear under "As Beneficiary" on **Intervene & Claim**.

### Register your document key (do this early)

On an active will's detail page, the card reads "Register your document key".
Click **Register key**, sign the key message, and approve the transaction. The
card then reads "Your document key is registered".

- You can register only while the will is **active**.
- You can only open documents uploaded **after** you register. Tell the owner
  when you have done it.

### Claim tokens

When the pill reads **Claimable now**, the detail page shows "Inherited tokens".

- Each token row shows your share of the total escrowed. Click
  **Claim {amount} {symbol}** to receive it. Each token is claimed separately.
- During the grace period rows say "Locked until the owner's revocation window
  ends."
- Once claimed, the row reads "Claimed … — sent to your wallet."
- Your share is a fixed percentage of the total deposited, so other heirs
  claiming first does not reduce it.

The "Your Share" card also has **Record my claim**. This marks the inheritance
as received on-chain. It does not move tokens and is not required to open
documents.

### Open documents

On the detail page, "Inherited documents & assets" lists each document. Click
**Preview Content** and sign in if prompted. The file is downloaded and decrypted
in your browser with your document key.

- The server only lets heirs download documents after the grace period ends.
  During the grace period the list is visible but previews fail with "You do
  not have access to this document yet".
- "This document was not sealed to your wallet" means it was uploaded before you
  registered your key. Only the owner could fix that, by uploading it again.

---

## Anyone: sweep and close after the claim window

After the 90-day claim window, the contract allows **anyone** to:

- `sweepTokenVault(owner, token)`: send each vault's remaining balance (unclaimed
  shares, unallocated percentage, rounding dust) to the owner's address, then
- `closeEstate(owner, maxItems)`: clear the will's records. Call it repeatedly
  until it returns `true`. Every vault must be swept first.

**The dashboard has no buttons for these.** The functions exist in the app's
code but no page uses them. To run them, call the contract directly, for example
through the block explorer's contract page if the contract is verified, or with
Foundry:

```bash
cast send <CONTRACT_ADDRESS> "sweepTokenVault(address,address)" <OWNER> <TOKEN> --rpc-url <RPC> --account <KEYSTORE>
cast send <CONTRACT_ADDRESS> "closeEstate(address,uint256)" <OWNER> 32 --rpc-url <RPC> --account <KEYSTORE>
```

Funds always go to the owner's address, never to the caller.

---

## FAQ and troubleshooting

**The connect button says "No wallet found".**
No wallet extension was detected, and WalletConnect is not configured. Install or
unlock a browser wallet and reload.

**The button says "Switch to …".**
Your wallet is on another network. Click it. If switching fails, add the network
to your wallet manually (see [DEPLOYMENT.md](../DEPLOYMENT.md) for network
details).

**"Finish setting up your will before you …" / "QuorumUnreachable".**
Add at least one custodian, and make sure **Required custodian approvals** is not
higher than the number of custodians.

**I created a will but the page still says I have none.**
Wait a few seconds and reload. The app re-reads the chain after each transaction.

**The countdown hit zero. Did my will trigger?**
No. It only means custodians may now confirm. Nothing happens unless they do.
Click **Reset Timer (Check In)**.

**I added custodians and tokens. Did that reset my timer?**
No. Only check-in, saving settings, creating the will, or cancelling a
confirmation reset it.

**Every button on my will is disabled / "Will Locked".**
A custodian has started a death confirmation. Use **I'm alive — cancel this** in
the red banner.

**An heir can't open a document.**
They registered their key after the upload, or never registered. Once they show
**Key registered**, remove the document and upload it again.

**"You do not have access to this document yet".**
You are an heir and the 7-day grace period has not ended. Try again after it does.

**"Claims are not open yet — the owner's window to revoke has not passed."**
Same cause: wait for the grace period to end. On **Intervene & Claim** the
**Claim inheritance & decrypt files** button is shown during the grace period
even though the claim will be rejected.

**"You rejected the request in your wallet."**
You dismissed a transaction or signature. Try again.

**"Hourly upload limit reached" / "Too many requests".**
Limits are 25 MB per file and 200 MB per hour for uploads, plus request rate
limits. Wait and retry.

**Escrow shows two wallet prompts.**
ERC-20 tokens need an approval before the deposit. The approval is for exactly
the amount you entered.

**"Delete the will" fails.**
Withdraw every token and remove every document, custodian and beneficiary first.

**Success message says "Soft-confirmed by the sequencer".**
The transaction is included on Robinhood Chain but not yet final on Ethereum.
This is normal. Use the "view tx" link to follow it.

**The sidebar shows "undefined will".**
This is a known display bug in the sidebar status text. It does not affect your
will.

**Are the contracts audited?**
Some pages mention audits ("Halborn", "OtterSec, Neodyme", "in progress"). None
of these claims are verified, and the project's own deployment checklist lists
the security review as not yet done.

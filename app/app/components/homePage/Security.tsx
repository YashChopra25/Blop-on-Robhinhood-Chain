"use client";

import { AsciiArt } from "@/app/components/fx/AsciiArt";
import { ScrambleText, ScrambleZone } from "@/app/components/fx/ScrambleText";
import { SquigglyText } from "@/app/components/fx/SquigglyText";
import { paintVaultWheel } from "@/app/components/fx/artwork";

const pillars = [
  {
    title: "Non-custodial by design",
    body: "Your files, your keys. The contract never holds your data — only IPFS content hashes — and only the rules you signed can open it.",
  },
  {
    title: "Custodian-gated release",
    body: "The will turns claimable only after you go inactive and an M-of-N quorum confirms. No off-chain authority can override it.",
  },
  {
    title: "Open & auditable logic",
    body: "Source verified on Blockscout. Two independent audits in progress.",
  },
  {
    title: "Owner stays in control",
    body: "While the will is active you can re-seal documents, reweight heirs, swap custodians, or revoke the whole thing.",
  },
];

const SOURCE = `pub fn confirm_death(ctx: Context<ConfirmDeath>) -> Result<()> {
  let will = &mut ctx.accounts.will;
  let custodian = &mut ctx.accounts.custodian;
  require!(!custodian.has_approved, ErrorCode::AlreadyApproved);

  custodian.has_approved = true;
  will.approvals_received += 1;

  // Quorum reached -> beneficiaries may now claim.
  if will.approvals_received >= will.min_approvals {
    will.will_status = WillStatus::Claimable;
  }
  Ok(())
}`;

export function Security() {
  return (
    <section id="security" className="border-b border-border">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr]">
        <div className="border-b border-border px-5 py-12 sm:px-8 sm:py-16 lg:border-b-0 lg:border-r">
          <p className="label-mono text-accent">
            <ScrambleText text="Security" trigger="view" speed={40} />
          </p>
          <SquigglyText
            as="h2"
            rest={0.7}
            peak={6}
            className="mt-4 block text-3xl tracking-tight sm:text-[38px]"
          >
            <ScrambleText text="Trustless, not trust-me." trigger="view" speed={60} />
          </SquigglyText>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
            <ScrambleText
              text="Blop executes a contract you read, signed, and can verify on-chain. Your files are encrypted before they ever reach IPFS. No backdoors, no admin keys, no recovery hotline. That is the point."
              speed={200}
            />
          </p>

          <div className="mt-10 flex items-start gap-8">
            <div className="w-48 shrink-0 text-foreground/85">
              <AsciiArt
                paint={paintVaultWheel}
                cols={26}
                rows={13}
                ramp="ascii"
                gain={2.2}
                fontSize={13}
                blur={0.2}
                bite={5}
                className="font-mono"
                label="Vault wheel"
              />
            </div>
            <dl className="flex-1 border-t border-border text-sm">
              {[
                ["Program", "verified"],
                ["Audits", "2 in progress"],
                ["Admin keys", "none"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between border-b border-border py-2.5"
                >
                  <dt className="label-mono">{k}</dt>
                  <dd className="font-mono text-[12px] text-foreground">
                    <ScrambleText text={v} speed={30} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-10 border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="label-mono">custodian.rs</span>
              <span className="label-mono text-neon">verified</span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[11px] leading-relaxed text-muted">
              {SOURCE}
            </pre>
          </div>
        </div>

        <div>
          {pillars.map((p, i) => (
            <ScrambleZone
              key={p.title}
              as="div"
              className="border-b border-border px-5 py-8 transition-colors last:border-b-0 hover:bg-[rgba(233,229,220,0.025)] sm:px-8"
            >
              <div className="flex items-baseline gap-5">
                <span className="index-mono">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-base tracking-tight">
                    <ScrambleText text={p.title} trigger="zone" speed={32} />
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                    <ScrambleText text={p.body} trigger="zone" speed={175} />
                  </p>
                </div>
              </div>
            </ScrambleZone>
          ))}
        </div>
      </div>
    </section>
  );
}

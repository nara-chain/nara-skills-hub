import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { NaraSkillsHub } from "../target/types/nara_skills_hub";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";

// ── Constants matching Rust (updated for zero_copy + 64-byte reserved) ───────
const SKILL_BUFFER_HEADER = 144; // 8 disc + 32 authority + 32 skill + 4 total_len + 4 write_offset + 64 reserved
const SKILL_CONTENT_HEADER = 104; // 8 disc + 32 skill + 64 reserved
const ONE_SOL = new anchor.BN(1_000_000_000);
const NULL_KEY = PublicKey.default;

// ── Zero-copy helper: read a fixed-size byte array as a UTF-8 string ─────────
function zcString(bytes: number[], len: number): string {
  return Buffer.from(bytes.slice(0, len)).toString("utf-8");
}

describe("nara-skills-hub", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.NaraSkillsHub as Program<NaraSkillsHub>;
  const authority = provider.wallet as anchor.Wallet;

  // ── PDA helpers ─────────────────────────────────────────────────────────
  const skillPDA = (name: string): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("skill"), Buffer.from(name)],
      program.programId
    )[0];

  const descPDA = (skillKey: PublicKey): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("desc"), skillKey.toBuffer()],
      program.programId
    )[0];

  const configPDA = (): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    )[0];

  const metaPDA = (skillKey: PublicKey): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("meta"), skillKey.toBuffer()],
      program.programId
    )[0];

  // ── Utility: create a raw account owned by the program ──────────────────
  async function createProgramAccount(kp: Keypair, size: number) {
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(size);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: kp.publicKey,
        lamports,
        space: size,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(tx, [kp]);
  }

  // ── Helper: register a skill with config + feeRecipient ─────────────────
  async function doRegisterSkill(
    name: string,
    feeRecipient: PublicKey = authority.publicKey,
    author: string = "anonymous"
  ) {
    await program.methods
      .registerSkill(name, author)
      .accountsStrict({
        authority: authority.publicKey,
        skill: skillPDA(name),
        config: configPDA(),
        feeRecipient,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // ── One-time program init ────────────────────────────────────────────────
  before(async () => {
    await program.methods
      .initConfig()
      .accountsStrict({
        admin: authority.publicKey,
        config: configPDA(),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  // ── program_config ────────────────────────────────────────────────────────
  describe("program_config", () => {
    it("initializes with admin and 1 SOL default fee", async () => {
      const cfg = await program.account.programConfig.fetch(configPDA());
      expect(cfg.admin.toBase58()).to.eq(authority.publicKey.toBase58());
      expect(cfg.registerFee.eq(ONE_SOL)).to.be.true;
      expect(cfg.feeRecipient.toBase58()).to.eq(authority.publicKey.toBase58());
    });

    it("update_register_fee: admin can update", async () => {
      await program.methods
        .updateRegisterFee(new anchor.BN(0))
        .accountsStrict({ admin: authority.publicKey, config: configPDA() })
        .rpc();
      let cfg = await program.account.programConfig.fetch(configPDA());
      expect(cfg.registerFee.toNumber()).to.eq(0);

      // Restore to 1 SOL
      await program.methods
        .updateRegisterFee(ONE_SOL)
        .accountsStrict({ admin: authority.publicKey, config: configPDA() })
        .rpc();
      cfg = await program.account.programConfig.fetch(configPDA());
      expect(cfg.registerFee.eq(ONE_SOL)).to.be.true;
    });

    it("update_fee_recipient: admin can change and reset", async () => {
      const newRecipient = Keypair.generate();
      await program.methods
        .updateFeeRecipient(newRecipient.publicKey)
        .accountsStrict({ admin: authority.publicKey, config: configPDA() })
        .rpc();
      let cfg = await program.account.programConfig.fetch(configPDA());
      expect(cfg.feeRecipient.toBase58()).to.eq(
        newRecipient.publicKey.toBase58()
      );

      // Reset to authority
      await program.methods
        .updateFeeRecipient(authority.publicKey)
        .accountsStrict({ admin: authority.publicKey, config: configPDA() })
        .rpc();
    });

    it("rejects non-admin on update_register_fee", async () => {
      const other = Keypair.generate();
      try {
        await program.methods
          .updateRegisterFee(new anchor.BN(0))
          .accountsStrict({ admin: other.publicKey, config: configPDA() })
          .signers([other])
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("Unauthorized");
      }
    });

    it("rejects non-admin on update_fee_recipient", async () => {
      const other = Keypair.generate();
      try {
        await program.methods
          .updateFeeRecipient(other.publicKey)
          .accountsStrict({ admin: other.publicKey, config: configPDA() })
          .signers([other])
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("Unauthorized");
      }
    });

    it("collects fee when fee_recipient differs from authority", async () => {
      const recipient = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        recipient.publicKey,
        web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const smallFee = new anchor.BN(10_000_000);
      await program.methods
        .updateRegisterFee(smallFee)
        .accountsStrict({ admin: authority.publicKey, config: configPDA() })
        .rpc();
      await program.methods
        .updateFeeRecipient(recipient.publicKey)
        .accountsStrict({ admin: authority.publicKey, config: configPDA() })
        .rpc();

      try {
        const before = await provider.connection.getBalance(recipient.publicKey);
        await doRegisterSkill("fee-test-01", recipient.publicKey);
        const after = await provider.connection.getBalance(recipient.publicKey);
        expect(after - before).to.eq(10_000_000);
      } finally {
        await program.methods
          .updateRegisterFee(ONE_SOL)
          .accountsStrict({ admin: authority.publicKey, config: configPDA() })
          .rpc();
        await program.methods
          .updateFeeRecipient(authority.publicKey)
          .accountsStrict({ admin: authority.publicKey, config: configPDA() })
          .rpc();
      }
    });
  });

  // ── register_skill ────────────────────────────────────────────────────────
  describe("register_skill", () => {
    const NAME = "test-skill-01";

    it("creates a new SkillRecord PDA", async () => {
      await doRegisterSkill(NAME, authority.publicKey, "Test Author");

      const skill = await program.account.skillRecord.fetch(skillPDA(NAME));
      expect(skill.authority.toBase58()).to.eq(authority.publicKey.toBase58());
      expect(zcString(skill.name as number[], skill.nameLen)).to.eq(NAME);
      expect(zcString(skill.author as number[], skill.authorLen)).to.eq("Test Author");
      expect(skill.pendingBuffer.equals(NULL_KEY)).to.be.true;
      expect(skill.content.equals(NULL_KEY)).to.be.true;
      expect(skill.version).to.eq(0);
      expect(skill.createdAt.toNumber()).to.be.greaterThan(0);
      expect(skill.updatedAt.toNumber()).to.eq(0);
    });

    it("rejects duplicate names", async () => {
      try {
        await doRegisterSkill(NAME);
        expect.fail("expected error");
      } catch (_) {
        // Expected: account already in use
      }
    });

    it("rejects names shorter than 5 bytes (NameTooShort)", async () => {
      try {
        await doRegisterSkill("abcd");
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("NameTooShort");
      }
    });

    it("rejects names with uppercase letters (NameNotLowercase)", async () => {
      try {
        await doRegisterSkill("Hello-World");
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("NameNotLowercase");
      }
    });

    it("rejects author names longer than 64 bytes (AuthorTooLong)", async () => {
      try {
        await doRegisterSkill("long-auth-01", authority.publicKey, "A".repeat(65));
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("AuthorTooLong");
      }
    });
  });

  // ── set_description ───────────────────────────────────────────────────────
  describe("set_description", () => {
    const NAME = "desc-skill-01";

    before(async () => {
      await doRegisterSkill(NAME);
    });

    it("creates the description PDA on first call", async () => {
      const skillKey = skillPDA(NAME);
      const desc = "Writes beautiful haiku poems on demand.";
      await program.methods
        .setDescription(NAME, desc)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          descriptionAccount: descPDA(skillKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const d = await program.account.skillDescription.fetch(descPDA(skillKey));
      expect(zcString(d.description as number[], d.descriptionLen)).to.eq(desc);
    });

    it("updates the description on subsequent calls", async () => {
      const skillKey = skillPDA(NAME);
      const newDesc = "Short haiku generator.";
      await program.methods
        .setDescription(NAME, newDesc)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          descriptionAccount: descPDA(skillKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const d = await program.account.skillDescription.fetch(descPDA(skillKey));
      expect(zcString(d.description as number[], d.descriptionLen)).to.eq(newDesc);
    });

    it("rejects non-authority signer", async () => {
      const skillKey = skillPDA(NAME);
      const other = Keypair.generate();
      try {
        await program.methods
          .setDescription(NAME, "evil description")
          .accountsStrict({
            authority: other.publicKey,
            skill: skillKey,
            descriptionAccount: descPDA(skillKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([other])
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("Unauthorized");
      }
    });

    it("rejects descriptions longer than 512 bytes (DescriptionTooLong)", async () => {
      const skillKey = skillPDA(NAME);
      try {
        await program.methods
          .setDescription(NAME, "x".repeat(513))
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillKey,
            descriptionAccount: descPDA(skillKey),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "DescriptionTooLong"
        );
      }
    });
  });

  // ── update_metadata ───────────────────────────────────────────────────────
  describe("update_metadata", () => {
    const NAME = "meta-skill-01";

    before(async () => {
      await doRegisterSkill(NAME);
    });

    it("creates metadata PDA on first call and stores JSON", async () => {
      const skillKey = skillPDA(NAME);
      const json = JSON.stringify({ tags: ["ai", "poetry"], lang: "en" });
      await program.methods
        .updateMetadata(NAME, json)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          metadata: metaPDA(skillKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const meta = await program.account.skillMetadata.fetch(metaPDA(skillKey));
      expect(zcString(meta.data as number[], meta.dataLen)).to.eq(json);
    });

    it("overwrites metadata on subsequent calls", async () => {
      const skillKey = skillPDA(NAME);
      const updated = JSON.stringify({ tags: ["ai"], lang: "zh", version: 2 });
      await program.methods
        .updateMetadata(NAME, updated)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          metadata: metaPDA(skillKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const meta = await program.account.skillMetadata.fetch(metaPDA(skillKey));
      expect(zcString(meta.data as number[], meta.dataLen)).to.eq(updated);
    });

    it("rejects non-authority signer", async () => {
      const skillKey = skillPDA(NAME);
      const other = Keypair.generate();
      try {
        await program.methods
          .updateMetadata(NAME, "{}")
          .accountsStrict({
            authority: other.publicKey,
            skill: skillKey,
            metadata: metaPDA(skillKey),
            systemProgram: SystemProgram.programId,
          })
          .signers([other])
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("Unauthorized");
      }
    });

    it("rejects data longer than 800 bytes (MetadataTooLong)", async () => {
      const skillKey = skillPDA(NAME);
      try {
        await program.methods
          .updateMetadata(NAME, "x".repeat(801))
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillKey,
            metadata: metaPDA(skillKey),
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("MetadataTooLong");
      }
    });
  });

  // ── transfer_authority ────────────────────────────────────────────────────
  describe("transfer_authority", () => {
    const NAME = "transfer-skill-01";
    const newOwner = Keypair.generate();

    before(async () => {
      await doRegisterSkill(NAME);
    });

    it("transfers authority to a new pubkey", async () => {
      const skillKey = skillPDA(NAME);
      await program.methods
        .transferAuthority(NAME, newOwner.publicKey)
        .accountsStrict({ authority: authority.publicKey, skill: skillKey })
        .rpc();

      const skill = await program.account.skillRecord.fetch(skillKey);
      expect(skill.authority.toBase58()).to.eq(newOwner.publicKey.toBase58());
    });

    it("old authority can no longer modify", async () => {
      const skillKey = skillPDA(NAME);
      try {
        await program.methods
          .transferAuthority(NAME, authority.publicKey)
          .accountsStrict({ authority: authority.publicKey, skill: skillKey })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("Unauthorized");
      }
    });

    it("rejects transfer while a pending buffer exists (HasPendingBuffer)", async () => {
      const name = "transfer-buf-01";
      const bufKp = Keypair.generate();
      const skillKey = skillPDA(name);

      await doRegisterSkill(name);
      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + 10);
      await program.methods
        .initBuffer(name, 10)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufKp.publicKey,
        })
        .rpc();

      try {
        await program.methods
          .transferAuthority(name, Keypair.generate().publicKey)
          .accountsStrict({ authority: authority.publicKey, skill: skillKey })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "HasPendingBuffer"
        );
      }

      // Cleanup
      await program.methods
        .closeBuffer(name)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufKp.publicKey,
        })
        .rpc();
    });
  });

  // ── buffer upload: new skill content ─────────────────────────────────────
  describe("buffer upload (new skill)", () => {
    const NAME = "buffer-skill-01";
    const CONTENT = Buffer.from(
      "You are a professional poet specialising in haiku. " +
        "Write expressive, evocative poems that capture emotion and imagery " +
        "in exactly 17 syllables (5-7-5). " +
        "Focus on nature, impermanence, and sudden illumination. " +
        "Always respond with just the poem — no title, no explanation. " +
        "Example: 'An old silent pond / A frog jumps into the pond / Splash! Silence again.'"
    );

    before(async () => {
      await doRegisterSkill(NAME);
    });

    it("init_buffer → write ×2 → finalize_skill_new stores correct bytes", async () => {
      const skillKey = skillPDA(NAME);
      const bufferKp = Keypair.generate();
      const contentKp = Keypair.generate();
      const totalLen = CONTENT.length;

      await createProgramAccount(bufferKp, SKILL_BUFFER_HEADER + totalLen);

      await program.methods
        .initBuffer(NAME, totalLen)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufferKp.publicKey,
        })
        .rpc();

      let skill = await program.account.skillRecord.fetch(skillKey);
      expect(skill.pendingBuffer.toBase58()).to.eq(
        bufferKp.publicKey.toBase58()
      );

      const mid = Math.floor(totalLen / 2);
      await program.methods
        .writeToBuffer(NAME, 0, CONTENT.slice(0, mid))
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufferKp.publicKey,
        })
        .rpc();

      await program.methods
        .writeToBuffer(NAME, mid, CONTENT.slice(mid))
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufferKp.publicKey,
        })
        .rpc();

      await createProgramAccount(contentKp, SKILL_CONTENT_HEADER + totalLen);

      await program.methods
        .finalizeSkillNew(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufferKp.publicKey,
          newContent: contentKp.publicKey,
        })
        .rpc();

      skill = await program.account.skillRecord.fetch(skillKey);
      expect(skill.content.toBase58()).to.eq(contentKp.publicKey.toBase58());
      expect(skill.pendingBuffer.equals(NULL_KEY)).to.be.true;
      expect(skill.version).to.eq(1);

      const info = await provider.connection.getAccountInfo(contentKp.publicKey);
      const stored = Buffer.from(info!.data.slice(SKILL_CONTENT_HEADER));
      expect(stored.toString()).to.eq(CONTENT.toString());

      const bufInfo = await provider.connection.getAccountInfo(bufferKp.publicKey);
      expect(bufInfo).to.be.null;
    });
  });

  // ── write_to_buffer offset enforcement ───────────────────────────────────
  describe("write_to_buffer offset enforcement", () => {
    const NAME = "offset-err-01";
    let bufferKp: Keypair;

    before(async () => {
      bufferKp = Keypair.generate();
      await doRegisterSkill(NAME);
      await createProgramAccount(bufferKp, SKILL_BUFFER_HEADER + 100);
      await program.methods
        .initBuffer(NAME, 100)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufferKp.publicKey,
        })
        .rpc();
    });

    it("rejects non-zero offset when cursor is 0 (OffsetMismatch)", async () => {
      try {
        await program.methods
          .writeToBuffer(NAME, 10, Buffer.alloc(10))
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(NAME),
            buffer: bufferKp.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("OffsetMismatch");
      }
    });

    it("write at offset 0 succeeds and advances cursor to 10", async () => {
      await program.methods
        .writeToBuffer(NAME, 0, Buffer.alloc(10))
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufferKp.publicKey,
        })
        .rpc();

      const buf = await program.account.skillBuffer.fetch(bufferKp.publicKey);
      expect(buf.writeOffset).to.eq(10);
    });

    it("retry at offset 0 is rejected (cursor already at 10)", async () => {
      try {
        await program.methods
          .writeToBuffer(NAME, 0, Buffer.alloc(10))
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(NAME),
            buffer: bufferKp.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("OffsetMismatch");
      }
    });

    it("rejects write that would exceed total_len (WriteOutOfBounds)", async () => {
      try {
        await program.methods
          .writeToBuffer(NAME, 10, Buffer.alloc(95))
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(NAME),
            buffer: bufferKp.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "WriteOutOfBounds"
        );
      }
    });
  });

  // ── init_buffer: rejects second buffer while one is pending ──────────────
  describe("init_buffer duplicate guard", () => {
    const NAME = "dup-buf-01";

    before(async () => {
      const bufKp = Keypair.generate();
      await doRegisterSkill(NAME);
      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + 50);
      await program.methods
        .initBuffer(NAME, 50)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
    });

    it("rejects second init_buffer (PendingBufferExists)", async () => {
      const buf2 = Keypair.generate();
      await createProgramAccount(buf2, SKILL_BUFFER_HEADER + 50);
      try {
        await program.methods
          .initBuffer(NAME, 50)
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(NAME),
            buffer: buf2.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "PendingBufferExists"
        );
      }
    });
  });

  // ── close_buffer ──────────────────────────────────────────────────────────
  describe("close_buffer", () => {
    const NAME = "close-buf-01";
    let buf1: Keypair;

    before(async () => {
      buf1 = Keypair.generate();
      await doRegisterSkill(NAME);
      await createProgramAccount(buf1, SKILL_BUFFER_HEADER + 64);
      await program.methods
        .initBuffer(NAME, 64)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: buf1.publicKey,
        })
        .rpc();
    });

    it("rejects close by non-authority (Unauthorized)", async () => {
      const other = Keypair.generate();
      try {
        await program.methods
          .closeBuffer(NAME)
          .accountsStrict({
            authority: other.publicKey,
            skill: skillPDA(NAME),
            buffer: buf1.publicKey,
          })
          .signers([other])
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("Unauthorized");
      }
    });

    it("closes buffer and clears pending_buffer", async () => {
      await program.methods
        .closeBuffer(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: buf1.publicKey,
        })
        .rpc();

      const skill = await program.account.skillRecord.fetch(skillPDA(NAME));
      expect(skill.pendingBuffer.equals(NULL_KEY)).to.be.true;
    });

    it("allows a fresh upload after close_buffer", async () => {
      const buf2 = Keypair.generate();
      await createProgramAccount(buf2, SKILL_BUFFER_HEADER + 32);
      await program.methods
        .initBuffer(NAME, 32)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: buf2.publicKey,
        })
        .rpc();

      const skill = await program.account.skillRecord.fetch(skillPDA(NAME));
      expect(skill.pendingBuffer.toBase58()).to.eq(buf2.publicKey.toBase58());

      // Cleanup
      await program.methods
        .closeBuffer(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: buf2.publicKey,
        })
        .rpc();
    });
  });

  // ── finalize_skill_new: incomplete buffer ────────────────────────────────
  describe("finalize_skill_new: incomplete buffer", () => {
    const NAME = "incomplete-buf-01";
    const TOTAL_LEN = 20;
    let bufKp: Keypair;
    let contentKp: Keypair;

    before(async () => {
      bufKp = Keypair.generate();
      contentKp = Keypair.generate();
      await doRegisterSkill(NAME);
      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + TOTAL_LEN);
      await program.methods
        .initBuffer(NAME, TOTAL_LEN)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(NAME, 0, Buffer.alloc(10))
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
    });

    it("rejects finalize when buffer is not fully written (BufferIncomplete)", async () => {
      await createProgramAccount(contentKp, SKILL_CONTENT_HEADER + TOTAL_LEN);
      try {
        await program.methods
          .finalizeSkillNew(NAME)
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(NAME),
            buffer: bufKp.publicKey,
            newContent: contentKp.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "BufferIncomplete"
        );
      }

      // Cleanup
      await program.methods
        .closeBuffer(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
    });
  });

  // ── finalize_skill_update ─────────────────────────────────────────────────
  describe("finalize_skill_update", () => {
    const NAME = "update-01";
    const V1 = Buffer.from("Skill content version 1.");
    const V2 = Buffer.from(
      "Skill content version 2 — significantly longer than v1 to exercise rent accounting."
    );
    let contentV1Kp: Keypair;

    before(async () => {
      contentV1Kp = Keypair.generate();
      const bufKp = Keypair.generate();

      await doRegisterSkill(NAME);

      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + V1.length);
      await program.methods
        .initBuffer(NAME, V1.length)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(NAME, 0, V1)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await createProgramAccount(contentV1Kp, SKILL_CONTENT_HEADER + V1.length);
      await program.methods
        .finalizeSkillNew(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
          newContent: contentV1Kp.publicKey,
        })
        .rpc();
    });

    it("replaces content and closes old content account", async () => {
      const bufV2Kp = Keypair.generate();
      const contentV2Kp = Keypair.generate();

      await createProgramAccount(bufV2Kp, SKILL_BUFFER_HEADER + V2.length);
      await program.methods
        .initBuffer(NAME, V2.length)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufV2Kp.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(NAME, 0, V2)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufV2Kp.publicKey,
        })
        .rpc();
      await createProgramAccount(contentV2Kp, SKILL_CONTENT_HEADER + V2.length);

      await program.methods
        .finalizeSkillUpdate(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufV2Kp.publicKey,
          newContent: contentV2Kp.publicKey,
          oldContent: contentV1Kp.publicKey,
        })
        .rpc();

      const skill = await program.account.skillRecord.fetch(skillPDA(NAME));
      expect(skill.content.toBase58()).to.eq(contentV2Kp.publicKey.toBase58());
      expect(skill.pendingBuffer.equals(NULL_KEY)).to.be.true;
      expect(skill.version).to.eq(2);

      const info = await provider.connection.getAccountInfo(contentV2Kp.publicKey);
      expect(Buffer.from(info!.data.slice(SKILL_CONTENT_HEADER)).toString()).to.eq(
        V2.toString()
      );

      const old = await provider.connection.getAccountInfo(contentV1Kp.publicKey);
      expect(old).to.be.null;
    });

    it("rejects finalize_skill_new when content already exists", async () => {
      const bufKp = Keypair.generate();
      const contentKp = Keypair.generate();
      const tiny = Buffer.alloc(5, 0x42);

      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + tiny.length);
      await program.methods
        .initBuffer(NAME, tiny.length)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(NAME, 0, tiny)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await createProgramAccount(contentKp, SKILL_CONTENT_HEADER + tiny.length);

      try {
        await program.methods
          .finalizeSkillNew(NAME)
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(NAME),
            buffer: bufKp.publicKey,
            newContent: contentKp.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "ContentAlreadyExists"
        );
      }

      // Cleanup
      await program.methods
        .closeBuffer(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
    });

    it("rejects reusing another skill's content account (ContentAlreadyInitialized)", async () => {
      const NAME_A = "reuse-cont-a1";
      const NAME_B = "reuse-cont-b1";
      const data = Buffer.from("shared size content!");

      // Finalize Skill A with content
      await doRegisterSkill(NAME_A);
      const bufA = Keypair.generate();
      const contentA = Keypair.generate();
      await createProgramAccount(bufA, SKILL_BUFFER_HEADER + data.length);
      await program.methods
        .initBuffer(NAME_A, data.length)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME_A), buffer: bufA.publicKey })
        .rpc();
      await program.methods
        .writeToBuffer(NAME_A, 0, data)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME_A), buffer: bufA.publicKey })
        .rpc();
      await createProgramAccount(contentA, SKILL_CONTENT_HEADER + data.length);
      await program.methods
        .finalizeSkillNew(NAME_A)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME_A),
          buffer: bufA.publicKey,
          newContent: contentA.publicKey,
        })
        .rpc();

      // Try to finalize Skill B using Skill A's content account
      await doRegisterSkill(NAME_B);
      const bufB = Keypair.generate();
      await createProgramAccount(bufB, SKILL_BUFFER_HEADER + data.length);
      await program.methods
        .initBuffer(NAME_B, data.length)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME_B), buffer: bufB.publicKey })
        .rpc();
      await program.methods
        .writeToBuffer(NAME_B, 0, data)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME_B), buffer: bufB.publicKey })
        .rpc();

      try {
        await program.methods
          .finalizeSkillNew(NAME_B)
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(NAME_B),
            buffer: bufB.publicKey,
            newContent: contentA.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("ContentAlreadyInitialized");
      }

      // Cleanup
      await program.methods
        .closeBuffer(NAME_B)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME_B),
          buffer: bufB.publicKey,
        })
        .rpc();
    });

    it("rejects new_content === old_content (ContentSelfReference)", async () => {
      const NAME_S = "self-ref-test";
      const data = Buffer.from("self ref content");

      // Register and finalize
      await doRegisterSkill(NAME_S);
      const buf1 = Keypair.generate();
      const content1 = Keypair.generate();
      await createProgramAccount(buf1, SKILL_BUFFER_HEADER + data.length);
      await program.methods
        .initBuffer(NAME_S, data.length)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME_S), buffer: buf1.publicKey })
        .rpc();
      await program.methods
        .writeToBuffer(NAME_S, 0, data)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME_S), buffer: buf1.publicKey })
        .rpc();
      await createProgramAccount(content1, SKILL_CONTENT_HEADER + data.length);
      await program.methods
        .finalizeSkillNew(NAME_S)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME_S),
          buffer: buf1.publicKey,
          newContent: content1.publicKey,
        })
        .rpc();

      // Init update buffer
      const buf2 = Keypair.generate();
      await createProgramAccount(buf2, SKILL_BUFFER_HEADER + data.length);
      await program.methods
        .initBuffer(NAME_S, data.length)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME_S), buffer: buf2.publicKey })
        .rpc();
      await program.methods
        .writeToBuffer(NAME_S, 0, data)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME_S), buffer: buf2.publicKey })
        .rpc();

      // Try finalize_skill_update with newContent === oldContent
      try {
        await program.methods
          .finalizeSkillUpdate(NAME_S)
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(NAME_S),
            buffer: buf2.publicKey,
            newContent: content1.publicKey,
            oldContent: content1.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("ContentSelfReference");
      }

      // Cleanup
      await program.methods
        .closeBuffer(NAME_S)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME_S),
          buffer: buf2.publicKey,
        })
        .rpc();
    });

    it("rejects finalize_skill_update when skill has no content (ContentNotFound)", async () => {
      const emptyName = "no-content-01";
      const bufKp2 = Keypair.generate();
      const contentKp2 = Keypair.generate();
      const dummyOldContent = Keypair.generate();
      const data = Buffer.from("hello");

      await doRegisterSkill(emptyName);
      await createProgramAccount(bufKp2, SKILL_BUFFER_HEADER + data.length);
      await program.methods
        .initBuffer(emptyName, data.length)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(emptyName),
          buffer: bufKp2.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(emptyName, 0, data)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(emptyName),
          buffer: bufKp2.publicKey,
        })
        .rpc();
      await createProgramAccount(contentKp2, SKILL_CONTENT_HEADER + data.length);
      await createProgramAccount(dummyOldContent, SKILL_CONTENT_HEADER + data.length);

      try {
        await program.methods
          .finalizeSkillUpdate(emptyName)
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillPDA(emptyName),
            buffer: bufKp2.publicKey,
            newContent: contentKp2.publicKey,
            oldContent: dummyOldContent.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "ContentNotFound"
        );
      }

      // Cleanup
      await program.methods
        .closeBuffer(emptyName)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(emptyName),
          buffer: bufKp2.publicKey,
        })
        .rpc();
    });
  });

  // ── delete_skill ─────────────────────────────────────────────────────────
  describe("delete_skill", () => {
    const NAME = "delete-skill-01";
    let contentKp: Keypair;

    before(async () => {
      contentKp = Keypair.generate();
      const bufKp = Keypair.generate();
      const CONTENT = Buffer.from("skill content to be deleted");

      await doRegisterSkill(NAME, authority.publicKey, "To Be Deleted");

      await program.methods
        .setDescription(NAME, "A skill that will be deleted.")
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          descriptionAccount: descPDA(skillPDA(NAME)),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .updateMetadata(NAME, JSON.stringify({ tag: "temp" }))
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          metadata: metaPDA(skillPDA(NAME)),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + CONTENT.length);
      await program.methods
        .initBuffer(NAME, CONTENT.length)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME), buffer: bufKp.publicKey })
        .rpc();
      await program.methods
        .writeToBuffer(NAME, 0, CONTENT)
        .accountsStrict({ authority: authority.publicKey, skill: skillPDA(NAME), buffer: bufKp.publicKey })
        .rpc();
      await createProgramAccount(contentKp, SKILL_CONTENT_HEADER + CONTENT.length);
      await program.methods
        .finalizeSkillNew(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
          newContent: contentKp.publicKey,
        })
        .rpc();
    });

    it("closes skill record, description, metadata, and content; returns rent", async () => {
      const skillKey = skillPDA(NAME);

      await program.methods
        .deleteSkill(NAME)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          description: descPDA(skillKey),
          metadata: metaPDA(skillKey),
          contentAccount: contentKp.publicKey,
        })
        .rpc();

      expect(await provider.connection.getAccountInfo(skillKey)).to.be.null;
      expect(await provider.connection.getAccountInfo(descPDA(skillKey))).to.be.null;
      expect(await provider.connection.getAccountInfo(metaPDA(skillKey))).to.be.null;
      expect(await provider.connection.getAccountInfo(contentKp.publicKey)).to.be.null;
    });

    it("allows re-registration with the same name after deletion", async () => {
      const skillKey = skillPDA(NAME);
      await doRegisterSkill(NAME, authority.publicKey, "Reborn");

      const skill = await program.account.skillRecord.fetch(skillKey);
      expect(zcString(skill.author as number[], skill.authorLen)).to.eq("Reborn");
      expect(skill.version).to.eq(0);
    });

    it("rejects non-authority (Unauthorized)", async () => {
      const other = Keypair.generate();
      const skillKey = skillPDA(NAME);
      try {
        await program.methods
          .deleteSkill(NAME)
          .accountsStrict({
            authority: other.publicKey,
            skill: skillKey,
            description: descPDA(skillKey),
            metadata: metaPDA(skillKey),
            contentAccount: authority.publicKey,
          })
          .signers([other])
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("Unauthorized");
      }
    });

    it("rejects deletion while a pending buffer exists (HasPendingBuffer)", async () => {
      const NAME3 = "del-buf-guard";
      const bufKp = Keypair.generate();
      const skillKey = skillPDA(NAME3);

      await doRegisterSkill(NAME3);
      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + 10);
      await program.methods
        .initBuffer(NAME3, 10)
        .accountsStrict({ authority: authority.publicKey, skill: skillKey, buffer: bufKp.publicKey })
        .rpc();

      try {
        await program.methods
          .deleteSkill(NAME3)
          .accountsStrict({
            authority: authority.publicKey,
            skill: skillKey,
            description: descPDA(skillKey),
            metadata: metaPDA(skillKey),
            contentAccount: authority.publicKey,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("HasPendingBuffer");
      }

      // Cleanup
      await program.methods
        .closeBuffer(NAME3)
        .accountsStrict({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufKp.publicKey,
        })
        .rpc();
    });
  });
});

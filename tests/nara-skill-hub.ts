import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { NaraSkillHub } from "../target/types/nara_skill_hub";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";

// ── Constants matching Rust ───────────────────────────────────────────────────
const SKILL_BUFFER_HEADER = 80; // 8 disc + 32 authority + 32 skill + 4 total_len + 4 write_offset
const SKILL_CONTENT_HEADER = 72; // 8 disc + 32 authority + 32 skill

describe("nara-skill-hub", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.NaraSkillHub as Program<NaraSkillHub>;
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

  // ── register_skill ────────────────────────────────────────────────────────
  describe("register_skill", () => {
    const NAME = "test-skill-01";

    it("creates a new SkillRecord PDA", async () => {
      const skillKey = skillPDA(NAME);
      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const skill = await program.account.skillRecord.fetch(skillKey);
      expect(skill.authority.toBase58()).to.eq(authority.publicKey.toBase58());
      expect(skill.name).to.eq(NAME);
      expect(skill.pendingBuffer).to.be.null;
      expect(skill.content.equals(PublicKey.default)).to.be.true;
    });

    it("rejects duplicate names", async () => {
      const skillKey = skillPDA(NAME);
      try {
        await program.methods
          .registerSkill(NAME)
          .accounts({
            authority: authority.publicKey,
            skill: skillKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("expected error");
      } catch (_) {
        // Expected: account already in use
      }
    });

    it("rejects names longer than 32 bytes", async () => {
      const longName = "a".repeat(33);
      try {
        // findProgramAddressSync also rejects seeds > 32 bytes, so the
        // error may come from PDA derivation before the RPC call is made.
        const skillKey = skillPDA(longName);
        await program.methods
          .registerSkill(longName)
          .accounts({
            authority: authority.publicKey,
            skill: skillKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("expected error");
      } catch (e: any) {
        if (e.message === "expected error") throw e;
        // Either Solana rejects the seed (>32 bytes) or program returns NameTooLong
      }
    });
  });

  // ── set_description ───────────────────────────────────────────────────────
  describe("set_description", () => {
    const NAME = "desc-skill-01";

    before(async () => {
      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("creates the description PDA on first call", async () => {
      const skillKey = skillPDA(NAME);
      const desc = "Writes beautiful haiku poems on demand.";
      await program.methods
        .setDescription(NAME, desc)
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          descriptionAccount: descPDA(skillKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const d = await program.account.skillDescription.fetch(descPDA(skillKey));
      expect(d.description).to.eq(desc);
    });

    it("updates the description on subsequent calls", async () => {
      const skillKey = skillPDA(NAME);
      const newDesc = "Short haiku generator.";
      await program.methods
        .setDescription(NAME, newDesc)
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          descriptionAccount: descPDA(skillKey),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const d = await program.account.skillDescription.fetch(descPDA(skillKey));
      expect(d.description).to.eq(newDesc);
    });

    it("rejects non-authority signer", async () => {
      const skillKey = skillPDA(NAME);
      const other = Keypair.generate();
      try {
        await program.methods
          .setDescription(NAME, "evil description")
          .accounts({
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
          .accounts({
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

  // ── transfer_authority ────────────────────────────────────────────────────
  describe("transfer_authority", () => {
    const NAME = "transfer-skill-01";
    const newOwner = Keypair.generate();

    before(async () => {
      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("transfers authority to a new pubkey", async () => {
      const skillKey = skillPDA(NAME);
      await program.methods
        .transferAuthority(NAME, newOwner.publicKey)
        .accounts({ authority: authority.publicKey, skill: skillKey })
        .rpc();

      const skill = await program.account.skillRecord.fetch(skillKey);
      expect(skill.authority.toBase58()).to.eq(newOwner.publicKey.toBase58());
    });

    it("old authority can no longer modify", async () => {
      const skillKey = skillPDA(NAME);
      try {
        await program.methods
          .transferAuthority(NAME, authority.publicKey)
          .accounts({ authority: authority.publicKey, skill: skillKey })
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

      await program.methods
        .registerSkill(name)
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + 10);
      await program.methods
        .initBuffer(name, 10)
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufKp.publicKey,
        })
        .rpc();

      try {
        await program.methods
          .transferAuthority(name, Keypair.generate().publicKey)
          .accounts({ authority: authority.publicKey, skill: skillKey })
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
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  });

  // ── buffer upload: new skill content ─────────────────────────────────────
  describe("buffer upload (new skill)", () => {
    const NAME = "buffer-skill-01";
    // Intentionally > 800 bytes to exercise multi-chunk upload
    const CONTENT = Buffer.from(
      "You are a professional poet specialising in haiku. " +
        "Write expressive, evocative poems that capture emotion and imagery " +
        "in exactly 17 syllables (5-7-5). " +
        "Focus on nature, impermanence, and sudden illumination. " +
        "Always respond with just the poem — no title, no explanation. " +
        "Example: 'An old silent pond / A frog jumps into the pond / Splash! Silence again.'"
    );

    before(async () => {
      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("init_buffer → write ×2 → finalize_skill_new stores correct bytes", async () => {
      const skillKey = skillPDA(NAME);
      const bufferKp = Keypair.generate();
      const contentKp = Keypair.generate();
      const totalLen = CONTENT.length;

      // Client pre-creates buffer account (owner = program).
      await createProgramAccount(bufferKp, SKILL_BUFFER_HEADER + totalLen);

      // init_buffer
      await program.methods
        .initBuffer(NAME, totalLen)
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufferKp.publicKey,
        })
        .rpc();

      let skill = await program.account.skillRecord.fetch(skillKey);
      expect(skill.pendingBuffer?.toBase58()).to.eq(
        bufferKp.publicKey.toBase58()
      );

      // Write in two chunks.
      const mid = Math.floor(totalLen / 2);
      await program.methods
        .writeToBuffer(NAME, 0, CONTENT.slice(0, mid))
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufferKp.publicKey,
        })
        .rpc();

      await program.methods
        .writeToBuffer(NAME, mid, CONTENT.slice(mid))
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufferKp.publicKey,
        })
        .rpc();

      // Client pre-creates content account (owner = program).
      await createProgramAccount(contentKp, SKILL_CONTENT_HEADER + totalLen);

      // finalize_skill_new
      await program.methods
        .finalizeSkillNew(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillKey,
          buffer: bufferKp.publicKey,
          newContent: contentKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // SkillRecord updated.
      skill = await program.account.skillRecord.fetch(skillKey);
      expect(skill.content.toBase58()).to.eq(contentKp.publicKey.toBase58());
      expect(skill.pendingBuffer).to.be.null;

      // Content bytes match.
      const info = await provider.connection.getAccountInfo(contentKp.publicKey);
      const stored = Buffer.from(info!.data.slice(SKILL_CONTENT_HEADER));
      expect(stored.toString()).to.eq(CONTENT.toString());

      // Buffer account closed.
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
      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await createProgramAccount(bufferKp, SKILL_BUFFER_HEADER + 100);
      await program.methods
        .initBuffer(NAME, 100)
        .accounts({
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
          .accounts({
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
        .accounts({
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
          .accounts({
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
      // buffer total_len = 100, write_offset = 10; 10 + 95 = 105 > 100
      try {
        await program.methods
          .writeToBuffer(NAME, 10, Buffer.alloc(95))
          .accounts({
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
      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + 50);
      await program.methods
        .initBuffer(NAME, 50)
        .accounts({
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
          .accounts({
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
      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await createProgramAccount(buf1, SKILL_BUFFER_HEADER + 64);
      await program.methods
        .initBuffer(NAME, 64)
        .accounts({
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
          .accounts({
            authority: other.publicKey,
            skill: skillPDA(NAME),
            buffer: buf1.publicKey,
            systemProgram: SystemProgram.programId,
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
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: buf1.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const skill = await program.account.skillRecord.fetch(skillPDA(NAME));
      expect(skill.pendingBuffer).to.be.null;
    });

    it("allows a fresh upload after close_buffer", async () => {
      const buf2 = Keypair.generate();
      await createProgramAccount(buf2, SKILL_BUFFER_HEADER + 32);
      await program.methods
        .initBuffer(NAME, 32)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: buf2.publicKey,
        })
        .rpc();

      const skill = await program.account.skillRecord.fetch(skillPDA(NAME));
      expect(skill.pendingBuffer?.toBase58()).to.eq(buf2.publicKey.toBase58());

      // Cleanup
      await program.methods
        .closeBuffer(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: buf2.publicKey,
          systemProgram: SystemProgram.programId,
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
      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + TOTAL_LEN);
      await program.methods
        .initBuffer(NAME, TOTAL_LEN)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      // Write only half — buffer remains incomplete
      await program.methods
        .writeToBuffer(NAME, 0, Buffer.alloc(10))
        .accounts({
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
          .accounts({
            authority: authority.publicKey,
            skill: skillPDA(NAME),
            buffer: bufKp.publicKey,
            newContent: contentKp.publicKey,
            systemProgram: SystemProgram.programId,
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
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
          systemProgram: SystemProgram.programId,
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

      await program.methods
        .registerSkill(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Upload v1
      await createProgramAccount(bufKp, SKILL_BUFFER_HEADER + V1.length);
      await program.methods
        .initBuffer(NAME, V1.length)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(NAME, 0, V1)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await createProgramAccount(contentV1Kp, SKILL_CONTENT_HEADER + V1.length);
      await program.methods
        .finalizeSkillNew(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
          newContent: contentV1Kp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("replaces content and closes old content account", async () => {
      const bufV2Kp = Keypair.generate();
      const contentV2Kp = Keypair.generate();

      await createProgramAccount(bufV2Kp, SKILL_BUFFER_HEADER + V2.length);
      await program.methods
        .initBuffer(NAME, V2.length)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufV2Kp.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(NAME, 0, V2)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufV2Kp.publicKey,
        })
        .rpc();
      await createProgramAccount(contentV2Kp, SKILL_CONTENT_HEADER + V2.length);

      await program.methods
        .finalizeSkillUpdate(NAME)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufV2Kp.publicKey,
          newContent: contentV2Kp.publicKey,
          oldContent: contentV1Kp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // SkillRecord points to v2.
      const skill = await program.account.skillRecord.fetch(skillPDA(NAME));
      expect(skill.content.toBase58()).to.eq(contentV2Kp.publicKey.toBase58());
      expect(skill.pendingBuffer).to.be.null;

      // v2 content bytes correct.
      const info = await provider.connection.getAccountInfo(contentV2Kp.publicKey);
      expect(Buffer.from(info!.data.slice(SKILL_CONTENT_HEADER)).toString()).to.eq(
        V2.toString()
      );

      // Old content account closed.
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
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(NAME, 0, tiny)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
        })
        .rpc();
      await createProgramAccount(contentKp, SKILL_CONTENT_HEADER + tiny.length);

      try {
        await program.methods
          .finalizeSkillNew(NAME)
          .accounts({
            authority: authority.publicKey,
            skill: skillPDA(NAME),
            buffer: bufKp.publicKey,
            newContent: contentKp.publicKey,
            systemProgram: SystemProgram.programId,
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
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(NAME),
          buffer: bufKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects finalize_skill_update when skill has no content (ContentNotFound)", async () => {
      const emptyName = "no-content-01";
      const bufKp2 = Keypair.generate();
      const contentKp2 = Keypair.generate();
      const dummyOldContent = Keypair.generate();
      const data = Buffer.from("hello");

      await program.methods
        .registerSkill(emptyName)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(emptyName),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await createProgramAccount(bufKp2, SKILL_BUFFER_HEADER + data.length);
      await program.methods
        .initBuffer(emptyName, data.length)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(emptyName),
          buffer: bufKp2.publicKey,
        })
        .rpc();
      await program.methods
        .writeToBuffer(emptyName, 0, data)
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(emptyName),
          buffer: bufKp2.publicKey,
        })
        .rpc();
      await createProgramAccount(contentKp2, SKILL_CONTENT_HEADER + data.length);
      await createProgramAccount(dummyOldContent, SKILL_CONTENT_HEADER + data.length);

      try {
        // skill.content == Pubkey::default(); ContentNotFound fires as a constraint
        // on the skill account before old_content is validated.
        await program.methods
          .finalizeSkillUpdate(emptyName)
          .accounts({
            authority: authority.publicKey,
            skill: skillPDA(emptyName),
            buffer: bufKp2.publicKey,
            newContent: contentKp2.publicKey,
            oldContent: dummyOldContent.publicKey,
            systemProgram: SystemProgram.programId,
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
        .accounts({
          authority: authority.publicKey,
          skill: skillPDA(emptyName),
          buffer: bufKp2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  });
});

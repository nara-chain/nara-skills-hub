# Nara Skill Hub

> **Prompt Infrastructure for Autonomous Agents**  
> Upgrading AI skills from repo-bound strings into verifiable on-chain assets.

`Nara Skill Hub` is an on-chain registry built with Solana + Anchor 0.32.1 for registering, versioning, updating, discovering, and governing AI agent skills.

- **Program ID**: `54CFypri3UxCawUCLNvFebvpE1qWssKmVfk7RoKzLTkU`
- **Positioning Keywords**: Skill Assetization / Prompt Liquidity / On-chain Capability Layer / Verifiable Agent Infrastructure

---

## 1. Narrative: Why This Exists

In most agent stacks, skills are still treated as opaque config blobs:

- Scattered across private repos and not discoverable
- Updated without auditable anchors and hard to verify
- Lacking a shared namespace and hard to compose
- Missing durable incentive rails for quality contributors

`Nara Skill Hub` addresses this with four protocol-level ideas:

1. **Skill Assetization**
   Skills become on-chain state objects with name, author, description, content, and version.
2. **Prompt Liquidity**
   Skills gain global addresses and a unified read/write flow that any runtime can integrate.
3. **Capability Consensus Layer**
   Anyone can verify ownership and current version, creating a shared capability truth surface.
4. **Economic Flywheel**
   Registration fee mechanics (NARA/lamports) establish incentive alignment for quality supply.

---

## 2. Protocol Primitives

### 2.1 Global Namespace

- Skill PDA derived from `name` (`["skill", name]`)
- Globally unique names prevent semantic collisions
- Names can be re-registered after deletion, enabling namespace recirculation

### 2.2 Immutable Version Surface

- First publish sets `version = 1`
- Each content update increments `version`
- Creates an auditable and deterministic upgrade trail

### 2.3 Chunked Upload Rail

- Large payloads flow through `SkillBuffer`
- `write_to_buffer` enforces `offset == write_offset`
- Uploads can resume from failure without rewriting previous chunks

### 2.4 Two-Phase Commit for Content

- Phase A: `init_buffer` + `write_to_buffer*`
- Phase B: `finalize_skill_new` / `finalize_skill_update`
- Decouples ingest from activation and reduces state corruption risk

### 2.5 Metadata Composability

- `SkillMetadata` stores JSON payloads (max 800 bytes)
- Supports discovery, tagging, and ecosystem tooling integration

---

## 3. Core Accounts

All accounts use `#[account(zero_copy)]` with `#[repr(C)]` layout and 64-byte reserved space for future extensibility.

- `ProgramConfig` — PDA (`["config"]`): admin, registration fee, fee recipient
- `SkillRecord` — PDA (`["skill", name]`): canonical skill state (authority / name / author / version / content / pending_buffer)
- `SkillDescription` — PDA (`["desc", skill_key]`): human-readable description (max 512 bytes)
- `SkillMetadata` — PDA (`["meta", skill_key]`): extensible JSON metadata (max 800 bytes)
- `SkillBuffer` — client-created (keypair): chunked upload buffer with resumable semantics
- `SkillContent` — client-created (keypair): finalized active content account

> `SkillBuffer` and `SkillContent` are **not PDAs** — clients call `SystemProgram.createAccount` to allocate them, avoiding the CPI 10K realloc limit.

---

## 4. Instruction Matrix

| # | Instruction | Capability |
|---|-------------|------------|
| 1 | `init_config()` | Initializes config; caller becomes admin; default fee = `1_000_000_000` lamports |
| 2 | `update_admin(new_admin)` | Transfers admin authority |
| 3 | `update_fee_recipient(new_recipient)` | Updates registration fee recipient |
| 4 | `update_register_fee(new_fee)` | Updates registration fee (`0` means free registration) |
| 5 | `register_skill(name, author)` | Registers a skill (name 5–32 bytes, **lowercase only**, author max 64 bytes) |
| 6 | `set_description(name, description)` | Creates or updates description (max 512 bytes) |
| 7 | `transfer_authority(name, new_authority)` | Transfers skill ownership (requires no pending buffer) |
| 8 | `init_buffer(name, total_len)` | Initializes upload buffer |
| 9 | `write_to_buffer(name, offset, data)` | Sequential chunk writes with strict offset checks |
|10 | `finalize_skill_new(name)` | Finalizes first publish and sets `version = 1` |
|11 | `finalize_skill_update(name)` | Finalizes update, closes old content, increments version |
|12 | `close_buffer(name)` | Aborts upload and closes pending buffer |
|13 | `update_metadata(name, data)` | Creates or updates metadata JSON (max 800 bytes) |
|14 | `delete_skill(name)` | Closes related accounts and reclaims rent |

---

## 5. Lifecycle Playbooks

### 5.1 Bootstrap

```text
init_config()
└─ admin = caller
└─ register_fee = 1_000_000_000 lamports
└─ fee_recipient = caller
```

### 5.2 Mint a Skill Identity (Register + Publish)

```text
1) register_skill(name, author)
2) [client] createAccount(buffer, SkillBuffer::required_size(N), program_id)
3) init_buffer(name, N)
4) write_to_buffer(name, offset_i, chunk_i) ...
5) [client] createAccount(content, SkillContent::required_size(N), program_id)
6) finalize_skill_new(name)
```

### 5.3 Rolling Upgrade

```text
1) init_buffer(name, M)
2) write_to_buffer * K
3) finalize_skill_update(name)
└─ old content closed, rent returned, version++
```

### 5.4 Resume After Failure

```text
1) fetch SkillBuffer.write_offset
2) continue writes from write_offset
```

### 5.5 Skill Sunset (Delete + Reclaim Namespace)

```text
1) [optional] close_buffer(name)  // required if pending buffer exists
2) delete_skill(name)
3) [optional] register_skill(name, author)  // reclaim same name
```

---

## 6. Reliability and Invariants

- **Single Pending Buffer Invariant**: each skill can have at most one active pending buffer
- **Sequential Write Invariant**: writes must be strictly contiguous
- **Authority Gate**: sensitive operations require authority/admin privileges
- **Content Ownership Check**: buffer/content accounts must be owned by this program
- **Bounded Strings**: strict limits on name/author/description/metadata fields

Together these invariants define a recoverable, upgradeable, and governable skill state machine.

---

## 7. Error Surface (Selected)

- `NameTooShort` / `NameTooLong` / `NameNotLowercase`
- `AuthorTooLong`
- `DescriptionTooLong`
- `MetadataTooLong`
- `Unauthorized`
- `OffsetMismatch`
- `WriteOutOfBounds`
- `BufferIncomplete`
- `PendingBufferExists`
- `HasPendingBuffer`
- `InvalidBufferOwner` / `InvalidBufferSize` / `BufferMismatch`
- `InvalidContentOwner` / `InvalidContentSize` / `ContentMismatch`
- `ContentAlreadyExists` / `ContentNotFound`
- `InvalidFeeRecipient`

Full definitions: `programs/nara-skills-hub/src/error.rs`.

---

## 8. Repository Layout

```text
programs/nara-skills-hub/src/
├── lib.rs
├── error.rs
├── state/
│   ├── program_config.rs
│   ├── skill_record.rs
│   ├── skill_description.rs
│   ├── skill_metadata.rs
│   ├── skill_buffer.rs
│   └── skill_content.rs
└── instructions/
    ├── init_config.rs
    ├── update_admin.rs
    ├── update_fee_recipient.rs
    ├── update_register_fee.rs
    ├── register_skill.rs
    ├── set_description.rs
    ├── transfer_authority.rs
    ├── init_buffer.rs
    ├── write_to_buffer.rs
    ├── finalize_skill_new.rs
    ├── finalize_skill_update.rs
    ├── close_buffer.rs
    ├── update_metadata.rs
    └── delete_skill.rs
scripts/
└── init.ts              # standalone config init (tsx)
```

---

## 9. Build and Test

```bash
anchor build
anchor test
```

Requirements:

- Rust `1.89.0` (see `rust-toolchain.toml`)
- Anchor CLI `0.32.x`

---

## 10. One-Liner

**Nara Skill Hub transforms agent skills from app-layer config into verifiable on-chain capability assets, powering the liquidity layer for next-generation autonomous agents.**
